import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { EventBus } from './event-bus.mjs';

// Load dotenv
import 'dotenv/config';

export class Core {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.uiDir = resolve(process.cwd(), 'ui');
    this.events = new EventBus();
    this._services = new Map();  // name -> { status, lastCheck, latency, checkFn }
    this._recoveryAttempts = new Map(); // name -> { count, lastAttempt }
    this._startTime = Date.now();
    this._heartbeatTimer = null;
    this._reminderTimer = null;
    this._wsClients = new Set();
    this._wsServer = null;
    this._geminiWss = null;
    this.server = null;
    
    // Command whitelist from current serve-ui.mjs
    this._allowedCommands = new Set([
      'ls', 'cat', 'curl', 'echo', 'which', 'pwd', 'whoami', 'uname',
      'date', 'ps', 'grep', 'head', 'tail', 'wc', 'sort', 'find',
      'mkdir', 'touch', 'cp', 'mv', 'chmod', 'df', 'du',
      'free', 'uptime', 'id', 'env', 'printenv', 'ping',
      'tsc', 'git',
      'playerctl', 'pactl',
      'Telegram', 'kitty', 'haruna', 'nautilus',
    ]);
    
    this._blocked = ['sudo', 'su ', 'passwd', 'dd ', 'mkfs', 'chown', 'chgrp', 'shutdown', 'reboot'];
    
    this._mimeMap = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.map': 'application/json',
    };
  }
  
  // Register services with health check functions
  registerService(name, { check }) {
    this._services.set(name, {
      status: 'disconnected',
      lastCheck: null,
      latency: 0,
      checkFn: check || (async () => false),
    });
  }
  
  async start() {
    this._registerServices();
    this._registerRoutes();
    this._startHeartbeat();
    
    this.server = createServer(this._handleRequest.bind(this));
    
    // Setup WebSocket
    const { WebSocketServer, WebSocket } = await import('ws');

    // Core status WebSocket (noServer mode)
    this._wsServer = new WebSocketServer({ noServer: true });
    this._wsServer.on('connection', (ws) => {
      this._wsClients.add(ws);
      // Send current status on connect
      ws.send(JSON.stringify({ type: 'status', services: this._getServicesStatus(), uptime: this._getUptime() }));
      ws.on('close', () => this._wsClients.delete(ws));
    });

    // Gemini proxy WebSocket
    this._geminiWss = new WebSocketServer({ noServer: true });
    this._geminiWss.on('connection', (clientWs, req) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        clientWs.close(1011, 'Gemini API key not configured');
        return;
      }

      const targetUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

      const googleWs = new WebSocket(targetUrl);
      let connected = false;
      let pendingMessages = [];

      // Attach client handler IMMEDIATELY — buffer if Google not ready
      clientWs.on('message', (data) => {
        if (googleWs.readyState === WebSocket.OPEN) {
          googleWs.send(data);
        } else {
          pendingMessages.push(data);
        }
      });
      clientWs.on('close', () => { googleWs.close(); });

      googleWs.on('open', () => {
        connected = true;
        // Flush buffered messages
        for (const msg of pendingMessages) {
          googleWs.send(msg);
        }
        pendingMessages = [];

        // Forward google -> client
        googleWs.on('message', (data) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
          }
        });
        googleWs.on('close', () => { clientWs.close(); });
      });

      googleWs.on('error', (err) => {
        console.error('[GeminiProxy] Error:', err.message);
        if (!connected) clientWs.close(1011, 'Failed to connect to Gemini');
      });

      googleWs.on('unexpected-response', () => {
        clientWs.close(1011, 'Gemini rejected connection (check API key)');
      });
    });

    // Handle all WebSocket upgrades manually
    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, `http://localhost:${this.port}`);

      if (url.pathname === '/api/core/ws') {
        this._wsServer.handleUpgrade(req, socket, head, (ws) => {
          this._wsServer.emit('connection', ws, req);
        });
      } else if (url.pathname === '/api/gemini/ws') {
        this._geminiWss.handleUpgrade(req, socket, head, (ws) => {
          this._geminiWss.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });
    
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`\n  🎨 Ufi Live UI: http://localhost:${this.port}\n`);
        resolve();
      });
    });
  }
  
  async stop() {
    this._stopHeartbeat();
    if (this._wsServer) this._wsServer.close();
    if (this._geminiWss) this._geminiWss.close();
    if (this.server) this.server.close();
  }
  
  // --- Private methods ---
  
  _registerServices() {
    // Mastra
    this.registerService('mastra', {
      check: async () => {
        const resp = await fetch('http://localhost:4111/api/agents/').catch(() => null);
        return resp?.ok ?? false;
      }
    });
    
    // Telegram
    this.registerService('telegram', {
      check: async () => {
        try {
          const { getConnectionStatus } = await import('../tools/telegram-client.mjs');
          return getConnectionStatus() === 'connected';
        } catch { return false; }
      }
    });
    
    // Browser
    this.registerService('browser', {
      check: async () => {
        try {
          const { getBrowserStatus } = await import('../tools/browser-fast.mjs');
          return getBrowserStatus() === 'connected';
        } catch { return false; }
      }
    });
    
    // Gemini (just API key check)
    this.registerService('gemini', {
      check: async () => {
        const key = process.env.GEMINI_API_KEY;
        return !!key && key.length > 10;
      }
    });
  }
  
  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => this._checkAllServices(), 30000);
    this._reminderTimer = setInterval(() => this._checkReminders(), 15000);
    // Run first checks immediately
    this._checkAllServices();
    this._checkReminders();
  }
  
  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._reminderTimer) {
      clearInterval(this._reminderTimer);
      this._reminderTimer = null;
    }
  }
  
  async _checkReminders() {
    try {
      const { getDueReminders, markNotified, cleanupOld } = await import('../tools/reminder-store.mjs');
      const due = getDueReminders();
      for (const reminder of due) {
        console.log(`[Reminder] Due: "${reminder.text}"`);
        markNotified(reminder.id);
        this._broadcast({ type: 'reminder', text: reminder.text, datetime: reminder.datetime });
      }
      cleanupOld();
    } catch (err) {
      // reminder-store might not exist yet
    }
  }
  
  _broadcast(data) {
    const msg = JSON.stringify(data);
    for (const ws of this._wsClients) {
      try { ws.send(msg); } catch { this._wsClients.delete(ws); }
    }
  }
  
  async _checkAllServices() {
    for (const [name, svc] of this._services) {
      const start = Date.now();
      let status = 'disconnected';
      try {
        const ok = await svc.checkFn();
        status = ok ? 'connected' : 'disconnected';
      } catch {
        status = 'error';
      }
      const latency = Date.now() - start;
      
      const changed = svc.status !== status;
      svc.status = status;
      svc.lastCheck = new Date().toISOString();
      svc.latency = latency;
      
      if (changed) {
        this.events.emit('service-status-change', { name, status, latency });
        this._broadcastStatus();
        
        // Auto-recovery for disconnected services
        if (status === 'disconnected' || status === 'error') {
          this._attemptRecovery(name);
        }
      }
    }
  }
  
  async _attemptRecovery(name) {
    const rec = this._recoveryAttempts.get(name) || { count: 0, lastAttempt: 0 };
    const now = Date.now();
    
    // Max 3 attempts, exponential backoff
    if (rec.count >= 3) return;
    if (now - rec.lastAttempt < 60000 * Math.pow(2, rec.count)) return;
    
    rec.count++;
    rec.lastAttempt = now;
    this._recoveryAttempts.set(name, rec);
    
    console.log(`[Core] Auto-recovery for ${name} (attempt ${rec.count})`);
    
    // For Mastra, try to restart it
    if (name === 'mastra' && rec.count <= 1) {
      try {
        const child = spawn('npm', ['run', 'dev:mastra'], {
          detached: true,
          stdio: 'ignore',
          cwd: process.cwd(),
        });
        child.unref();
        console.log(`[Core] Mastra restart attempted (PID: ${child.pid})`);
      } catch (err) {
        console.error(`[Core] Failed to restart Mastra:`, err.message);
      }
    }
  }
  
  _getServicesStatus() {
    const services = {};
    for (const [name, svc] of this._services) {
      services[name] = {
        status: svc.status,
        lastCheck: svc.lastCheck,
        latency: svc.latency,
      };
    }
    return services;
  }
  
  _getUptime() {
    return Math.floor((Date.now() - this._startTime) / 1000);
  }
  
  _broadcastStatus() {
    const msg = JSON.stringify({
      type: 'status',
      services: this._getServicesStatus(),
      uptime: this._getUptime(),
    });
    for (const ws of this._wsClients) {
      try { ws.send(msg); } catch { this._wsClients.delete(ws); }
    }
  }
  
  _handleBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
  
  _sendJSON(res, status, data) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  }
  
  _runCommand(cmd, args) {
    let command = cmd;
    let commandArgs = args || [];
    
    if (command.includes(' ')) {
      const parts = command.split(' ');
      command = parts[0];
      commandArgs = [...parts.slice(1), ...(args || [])];
    }
    
    commandArgs = commandArgs.map(a => {
      if (typeof a === 'string') {
        a = a.replace(/^["']|["']$/g, '');
      }
      return a;
    });
    
    return new Promise((resolve) => {
      const child = spawn(command, commandArgs, {
        cwd: process.cwd(),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? -1 }));
      child.on('error', (err) => resolve({ stdout: '', stderr: err.message, exitCode: -1 }));
    });
  }
  
  async _fetchWithRetry(url, options, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return response;
        if (response.status === 429 || response.status === 502) {
          lastError = `HTTP ${response.status}`;
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter
            ? parseInt(retryAfter) * 1000
            : Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} got ${response.status}, waiting ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return response;
      } catch (err) {
        lastError = err.message;
        if (attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} error: ${err.message}, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Request failed after ${maxRetries} retries. Last error: ${lastError}`);
  }
  
  _registerRoutes() {
    // Store reference for the request handler
  }
  
  async _handleRequest(req, res) {
    try {
      const url = new URL(req.url, `http://localhost:${this.port}`);
      
      // ===== CORE API =====
      // GET /api/core/status — service status
      if (url.pathname === '/api/core/status' && req.method === 'GET') {
        this._sendJSON(res, 200, {
          services: this._getServicesStatus(),
          uptime: this._getUptime(),
          version: '1.0.0',
        });
        return;
      }
      
      // ===== AUTH: SERVICE STATUS =====
      if (url.pathname === '/api/auth/services' && req.method === 'GET') {
        const { getServices } = await import('../auth/auth-store.mjs');
        this._sendJSON(res, 200, { services: getServices() });
        return;
      }
      
      // ===== AUTH: CONNECT (API key services) =====
      if (url.pathname === '/api/auth/connect' && req.method === 'POST') {
        const body = await this._handleBody(req);
        const { service, credentials } = JSON.parse(body);
        if (!service || !credentials) { this._sendJSON(res, 400, { error: 'Missing service or credentials' }); return; }
        const { setServiceCredentials, isServiceConnected } = await import('../auth/auth-store.mjs');
        setServiceCredentials(service, credentials);
        this._broadcast({ type: 'auth', service, connected: true });
        this._sendJSON(res, 200, { success: true, message: `${service} connected` });
        console.log(`[Auth] ${service} connected`);
        return;
      }
      
      // ===== AUTH: DISCONNECT =====
      if (url.pathname === '/api/auth/disconnect' && req.method === 'POST') {
        const body = await this._handleBody(req);
        const { service } = JSON.parse(body);
        if (!service) { this._sendJSON(res, 400, { error: 'Missing service' }); return; }
        const { disconnectService } = await import('../auth/auth-store.mjs');
        disconnectService(service);
        this._broadcast({ type: 'auth', service, connected: false });
        this._sendJSON(res, 200, { success: true, message: `${service} disconnected` });
        console.log(`[Auth] ${service} disconnected`);
        return;
      }
      
      // ===== SYSTEM COMMAND =====
      if (url.pathname === '/api/exec') {
        if (req.method !== 'POST') { this._sendJSON(res, 405, { error: 'Method not allowed' }); return; }
        const body = await this._handleBody(req);
        const { command, args = [], background = false } = JSON.parse(body);
        
        if (!this._allowedCommands.has(command)) {
          this._sendJSON(res, 403, { error: `Command '${command}' not allowed`, stdout: '', stderr: '', exitCode: -1 });
          return;
        }
        for (const b of this._blocked) {
          if (command.includes(b)) {
            this._sendJSON(res, 403, { error: `Blocked pattern: ${b}`, stdout: '', stderr: '', exitCode: -1 });
            return;
          }
        }
        
        if (background) {
          const child = spawn(command, args, { detached: true, stdio: 'ignore', cwd: process.cwd() });
          child.unref();
          this._sendJSON(res, 200, { stdout: `Launched ${command} (PID: ${child.pid})`, stderr: '', exitCode: 0, pid: child.pid });
          console.log('[API] exec background:', command, args.join(' '));
        } else {
          const result = await this._runCommand(command, args);
          this._sendJSON(res, 200, result);
          console.log('[API] exec:', command, args.join(' '), '- exit:', result.exitCode);
        }
        return;
      }
      
      // ===== SEARCH PROXY =====
      if (url.pathname === '/api/search') {
        const query = url.searchParams.get('q');
        if (!query) { this._sendJSON(res, 400, { error: 'Missing query parameter' }); return; }
        const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const response = await fetch(apiUrl, { headers: { 'User-Agent': 'Ufi/1.0' } });
        const data = await response.json();
        this._sendJSON(res, 200, data);
        console.log('[API] Search proxy:', query, '-', response.status);
        return;
      }
      
      // ===== INTENT ROUTER =====
      if (url.pathname === '/api/intent/route' && req.method === 'POST') {
        const body = await this._handleBody(req);
        const { text } = JSON.parse(body);
        if (!text) { this._sendJSON(res, 400, { error: 'Missing text' }); return; }
        
        const { detectIntent } = await import('../tools/intent-router.mjs');
        const intent = detectIntent(text);
        
        if (!intent) {
          this._sendJSON(res, 200, { matched: false });
          return;
        }
        
        console.log(`[IntentRouter] Matched: ${intent.type} →`, JSON.stringify(intent));
        let result;
        
        switch (intent.type) {
          case 'browse': {
            const { goto } = await import('../tools/browser-fast.mjs');
            result = await goto(intent.url);
            break;
          }
          case 'youtube': {
            const { youtubeSearch } = await import('../tools/browser-fast.mjs');
            result = await youtubeSearch(intent.query);
            break;
          }
          case 'weather': {
            const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(intent.city)}&units=metric&appid=${process.env.OPENWEATHER_API_KEY || ''}`;
            try {
              const resp = await fetch(apiUrl);
              const data = await resp.json();
              if (data.main) {
                result = { success: true, message: `В ${intent.city} сейчас ${Math.round(data.main.temp)}°C, ${data.weather[0].description}` };
              } else {
                result = { success: false, message: `Не удалось получить погоду для ${intent.city}` };
              }
            } catch (e) {
              result = { success: false, message: `Ошибка получения погоды: ${e.message}` };
            }
            break;
          }
          case 'launch': {
            try {
              const child = spawn(intent.app, [], { detached: true, stdio: 'ignore' });
              child.unref();
              result = { success: true, message: `Запущен ${intent.app}` };
            } catch (e) {
              result = { success: false, message: `Не удалось запустить ${intent.app}: ${e.message}` };
            }
            break;
          }
          case 'search': {
            const { search } = await import('../tools/browser-fast.mjs');
            result = await search(intent.query);
            break;
          }
          case 'telegram_send': {
            const lowerRaw = (intent.raw || '').toLowerCase();
            if (lowerRaw.includes('избранные')) {
              try {
                const { sendToSavedMessages } = await import('../tools/telegram-client.mjs');
                const r = await sendToSavedMessages(intent.text);
                result = { success: true, message: 'Сообщение отправлено в Избранные ✅' };
              } catch (e) {
                result = { success: false, message: 'Ошибка Telegram: ' + e.message };
              }
            } else {
              result = { success: false, message: 'Для отправки контактам используйте голосовой ассистент' };
            }
            break;
          }
          case 'telegram_read': {
            try {
              const { getRecentMessages, getUnreadMessages } = await import('../tools/telegram-client.mjs');
              const isUnread = intent.subtype === 'unread' || (intent.raw || '').toLowerCase().includes('непрочитан');
              
              if (isUnread) {
                const msgs = await getUnreadMessages(10);
                if (msgs.length === 0) {
                  result = { success: true, message: '✅ Непрочитанных сообщений нет' };
                } else {
                  const text = msgs.map((m, i) => `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}`).join('\n');
                  result = { success: true, message: `📨 Непрочитанные сообщения:\n${text}` };
                }
              } else {
                const msgs = await getRecentMessages(10);
                if (msgs.length === 0) {
                  result = { success: true, message: '✅ Нет последних сообщений' };
                } else {
                  const text = msgs.map((m, i) => `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}${m.unread ? ' [❗]' : ''}`).join('\n');
                  result = { success: true, message: `📨 Последние сообщения:\n${text}` };
                }
              }
            } catch (e) {
              result = { success: false, message: 'Ошибка Telegram: ' + e.message };
            }
            break;
          }
          case 'media': {
            const action = intent.action || 'play-pause';
            const actionMap = {
              'stop': ['stop'],
              'pause': ['pause'],
              'play': ['play'],
              'play-pause': ['play-pause'],
              'next': ['next'],
              'previous': ['previous'],
              'volume-up': ['volume', '0.1+'],
              'volume-down': ['volume', '0.1-'],
            };
            const args = actionMap[action] || ['play-pause'];
            try {
              const r = await this._runCommand('playerctl', args);
              result = { success: r.exitCode === 0, message: `Media ${action}`, stdout: r.stdout, stderr: r.stderr };
            } catch (e) {
              result = { success: false, message: `Media error: ${e.message}` };
            }
            break;
          }
          default:
            result = { success: false, message: 'Unknown intent type' };
        }
        
        this._sendJSON(res, 200, { matched: true, intent, result });
        console.log(`[IntentRouter] Result:`, JSON.stringify(result).slice(0, 200));
        return;
      }
      
      // ===== MASTRA AGENT PROXY =====
      if (url.pathname === '/api/mastra/agent/generate' && req.method === 'POST') {
        const body = await this._handleBody(req);
        const { agentId, task } = JSON.parse(body);
        if (!agentId || !task) { this._sendJSON(res, 400, { error: 'Missing agentId or task' }); return; }
        
        // Fast path
        const { detectIntent } = await import('../tools/intent-router.mjs');
        let intent = detectIntent(task);
        
        if (intent && intent.type === 'telegram_send') {
          const lowerRaw = (intent.raw || '').toLowerCase();
          if (!lowerRaw.includes('избранные') && !lowerRaw.includes(' me') && lowerRaw !== 'me') {
            console.log(`[FastPath] telegram_send to contact, falling through to slow path`);
            intent = null;
          }
        }
        
        if (intent) {
          console.log(`[FastPath] "${task}" → ${intent.type}`, JSON.stringify(intent));
          let result;
          
          switch (intent.type) {
            case 'browse': {
              const { goto } = await import('../tools/browser-fast.mjs');
              result = await goto(intent.url);
              break;
            }
            case 'youtube': {
              const { youtubeSearch } = await import('../tools/browser-fast.mjs');
              result = await youtubeSearch(intent.query);
              break;
            }
            case 'weather': {
              const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(intent.city)}&units=metric&appid=${process.env.OPENWEATHER_API_KEY || ''}`;
              try {
                const resp = await fetch(apiUrl);
                const data = await resp.json();
                if (data.main) {
                  result = { success: true, message: `В ${intent.city} сейчас ${Math.round(data.main.temp)}°C, ${data.weather[0].description}` };
                } else {
                  result = { success: false, message: `Не удалось получить погоду для ${intent.city}` };
                }
              } catch (e) {
                result = { success: false, message: `Ошибка погоды: ${e.message}` };
              }
              break;
            }
            case 'launch': {
              try {
                const child = spawn(intent.app, [], { detached: true, stdio: 'ignore' });
                child.unref();
                result = { success: true, message: `Запущен ${intent.app}` };
              } catch (e) {
                result = { success: false, message: `Ошибка запуска: ${e.message}` };
              }
              break;
            }
            case 'search': {
              const { search } = await import('../tools/browser-fast.mjs');
              result = await search(intent.query);
              break;
            }
            case 'telegram_send': {
              try {
                const { sendToSavedMessages } = await import('../tools/telegram-client.mjs');
                const r = await sendToSavedMessages(intent.text);
                result = { success: true, message: 'Сообщение отправлено в Избранные ✅' };
              } catch (e) {
                result = { success: false, message: 'Ошибка Telegram: ' + e.message };
              }
              break;
            }
            case 'telegram_read': {
              try {
                const { getRecentMessages, getUnreadMessages } = await import('../tools/telegram-client.mjs');
                const isUnread = intent.subtype === 'unread' || (intent.raw || '').toLowerCase().includes('непрочитан');
                if (isUnread) {
                  const msgs = await getUnreadMessages(10);
                  result = msgs.length === 0
                    ? { success: true, message: '✅ Непрочитанных сообщений нет' }
                    : { success: true, message: `📨 Непрочитанные сообщения:\n${msgs.map((m, i) => `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}`).join('\n')}` };
                } else {
                  const msgs = await getRecentMessages(10);
                  result = msgs.length === 0
                    ? { success: true, message: '✅ Нет последних сообщений' }
                    : { success: true, message: `📨 Последние сообщения:\n${msgs.map((m, i) => `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}${m.unread ? ' [❗]' : ''}`).join('\n')}` };
                }
              } catch (e) {
                result = { success: false, message: 'Ошибка Telegram: ' + e.message };
              }
              break;
            }
            case 'media': {
              const action = intent.action || 'play-pause';
              const actionMap = {
                'stop': ['stop'],
                'pause': ['pause'],
                'play': ['play'],
                'play-pause': ['play-pause'],
                'next': ['next'],
                'previous': ['previous'],
                'volume-up': ['volume', '0.1+'],
                'volume-down': ['volume', '0.1-'],
              };
              const args = actionMap[action] || ['play-pause'];
              try {
                const r = await this._runCommand('playerctl', args);
                result = { success: r.exitCode === 0, message: `Media ${action}`, stdout: r.stdout, stderr: r.stderr };
              } catch (e) {
                result = { success: false, message: `Media error: ${e.message}` };
              }
              break;
            }
            default:
              result = { success: false, message: 'Unknown intent' };
          }
          
          this._sendJSON(res, 200, { result: result.message, fastPath: true, matched: true, intent: intent.type });
          console.log(`[FastPath] Result:`, result.message?.slice(0, 100));
          return;
        }
        
        // Slow path
        console.log(`[SlowPath] "${task}" → Mastra ${agentId}`);
        const mastraRes = await this._fetchWithRetry(
          `http://localhost:4111/api/agents/${agentId}/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: task }], maxSteps: 3 }),
            signal: AbortSignal.timeout(30000),
          },
          3
        );
        
        if (!mastraRes.ok) {
          const errText = await mastraRes.text();
          this._sendJSON(res, 502, { error: `Mastra error: ${mastraRes.status}`, detail: errText });
          return;
        }
        
        const data = await mastraRes.json();
        this._sendJSON(res, 200, { result: data.text || data, fastPath: false });
        return;
      }
      
      // ===== IMAGE: Local =====
      if (url.pathname === '/api/image' && req.method === 'GET') {
        const filePath = url.searchParams.get('path');
        if (!filePath) { this._sendJSON(res, 400, { error: 'Missing path parameter' }); return; }
        if (!filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i)) {
          this._sendJSON(res, 403, { error: 'Not an image file' }); return;
        }
        try {
          const content = await readFile(filePath);
          const ext = extname(filePath);
          res.writeHead(200, { 'Content-Type': this._mimeMap[ext] || 'image/png' });
          res.end(content);
        } catch (err) {
          this._sendJSON(res, 404, { error: 'File not found: ' + filePath });
        }
        return;
      }
      
      // ===== IMAGE PROXY: Remote =====
      if (url.pathname === '/api/image-proxy' && req.method === 'GET') {
        const imageUrl = url.searchParams.get('url');
        if (!imageUrl) { this._sendJSON(res, 400, { error: 'Missing url parameter' }); return; }
        try {
          const response = await fetch(imageUrl, {
            headers: { 'User-Agent': 'Ufi/1.0' },
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) {
            this._sendJSON(res, 502, { error: 'Failed to fetch: ' + response.status });
            return;
          }
          const buffer = await response.arrayBuffer();
          const contentType = response.headers.get('content-type') || 'image/jpeg';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
          });
          res.end(Buffer.from(buffer));
        } catch (err) {
          this._sendJSON(res, 502, { error: 'Image proxy error: ' + err.message });
        }
        return;
      }
      
      // ===== TELEGRAM API =====
      if (url.pathname === '/api/telegram' && req.method === 'POST') {
        const body = await this._handleBody(req);
        const { action, params } = JSON.parse(body);
        if (!action) { this._sendJSON(res, 400, { error: 'Missing action' }); return; }
        
        const { getClient, sendToSavedMessages, sendToContactByName, sendToChat, searchContacts, getRecentMessages, getUnreadMessages } = await import('../tools/telegram-client.mjs');
        
        let result;
        switch (action) {
          case 'send': {
            const { chat, text } = params || {};
            if (!chat || !text) { this._sendJSON(res, 400, { error: 'Missing chat or text' }); return; }
            const isSaved = chat === 'me' || chat === 'saved' || chat === 'избранные' || chat.toLowerCase() === 'избранные';
            if (isSaved) {
              result = await sendToSavedMessages(text);
            } else {
              try { result = await sendToContactByName(chat, text); }
              catch { result = await sendToChat(chat, text); }
            }
            break;
          }
          case 'search': {
            const { query, limit = 10 } = params || {};
            if (!query) { this._sendJSON(res, 400, { error: 'Missing query' }); return; }
            const contacts = await searchContacts(query, limit);
            result = { success: true, contacts, count: contacts.length };
            break;
          }
          case 'recent': {
            const { limit = 5 } = params || {};
            const messages = await getRecentMessages(limit);
            result = { success: true, messages, count: messages.length };
            break;
          }
          case 'unread': {
            const { limit = 10 } = params || {};
            const messages = await getUnreadMessages(limit);
            result = { success: true, messages, count: messages.length };
            break;
          }
          default:
            this._sendJSON(res, 400, { error: `Unknown action: ${action}` });
            return;
        }
        
        this._sendJSON(res, 200, result);
        console.log(`[Telegram API] ${action}:`, JSON.stringify(result).slice(0, 150));
        return;
      }
      
      // ===== BROWSER API =====
      if (url.pathname === '/api/browser' && req.method === 'POST') {
        const body = await this._handleBody(req);
        const { action, params } = JSON.parse(body);
        if (!action) { this._sendJSON(res, 400, { error: 'Missing action' }); return; }
        
        const { goto, youtubeSearch, youtubePlay } = await import('../tools/browser-fast.mjs');
        
        let result;
        switch (action) {
          case 'goto': {
            const { url: targetUrl } = params || {};
            if (!targetUrl) { this._sendJSON(res, 400, { error: 'Missing url' }); return; }
            result = await goto(targetUrl);
            break;
          }
          case 'youtube-search': {
            const { query } = params || {};
            if (!query) { this._sendJSON(res, 400, { error: 'Missing query' }); return; }
            result = await youtubeSearch(query);
            break;
          }
          case 'youtube-play': {
            const { query } = params || {};
            if (!query) { this._sendJSON(res, 400, { error: 'Missing query' }); return; }
            result = await youtubePlay(query);
            break;
          }
          default:
            this._sendJSON(res, 400, { error: `Unknown action: ${action}` });
            return;
        }
        
        this._sendJSON(res, 200, result);
        console.log(`[Browser API] ${action}:`, JSON.stringify(result).slice(0, 200));
        return;
      }
      
      // ===== DEEP RESEARCH API =====
      if (url.pathname === '/api/research/deep' && req.method === 'POST') {
        const body = await this._handleBody(req);
        const { topic } = JSON.parse(body);
        if (!topic) { this._sendJSON(res, 400, { error: 'Missing topic' }); return; }
        
        console.log(`[DeepResearch] Starting research on: "${topic}"`);
        const sections = [];
        sections.push(`# 📖 Исследование: ${topic}
`);
        
        // ---- Step 1: Wikipedia ----
        try {
          const searchResp = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json&srlimit=3&origin=*`,
            { signal: AbortSignal.timeout(10000) }
          );
          const searchData = await searchResp.json();
          const pages = searchData?.query?.search || [];
          
          if (pages.length > 0) {
            const pageTitle = pages[0].title;
            sections.push(`## 📚 Wikipedia
**[${pageTitle}](https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))})**

`);
            
            // Get page extract + image
            const extractResp = await fetch(
              `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro&explaintext&titles=${encodeURIComponent(pageTitle)}&format=json&pithumbsize=400&origin=*`,
              { signal: AbortSignal.timeout(10000) }
            );
            const extractData = await extractResp.json();
            const wikiPages = extractData?.query?.pages || {};
            const wikiPage = Object.values(wikiPages)[0];
            
            if (wikiPage) {
              if (wikiPage.thumbnail?.source) {
                sections.push(`![${wikiPage.title}](${wikiPage.thumbnail.source})

`);
              }
              if (wikiPage.extract) {
                sections.push(`${wikiPage.extract.slice(0, 4000)}

`);
              }
            }
            
            // Additional Wikipedia search results
            if (pages.length > 1) {
              sections.push(`**Другие статьи Wikipedia:**
`);
              for (let i = 1; i < pages.length; i++) {
                sections.push(`- [${pages[i].title}](https://en.wikipedia.org/wiki/${encodeURIComponent(pages[i].title.replace(/ /g, '_'))}) — ${pages[i].snippet.replace(/<[^>]+>/g, '')}
`);
              }
              sections.push(`
`);
            }
            
            console.log(`[DeepResearch] Wikipedia: found "${pageTitle}"`);
          } else {
            sections.push(`*Результатов в Wikipedia не найдено*

`);
          }
        } catch (err) {
          console.error(`[DeepResearch] Wikipedia error:`, err.message);
          sections.push(`*Wikipedia недоступна: ${err.message}*

`);
        }
        
        // ---- Step 2: Mastra agent research ----
        try {
          const mastraRes = await this._fetchWithRetry(
            `http://localhost:4111/api/agents/qwen-agent/generate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{ role: 'user', content: `Comprehensive web research on "${topic}". Use webSearch to find information from BBC, Reuters, news sites, and other authoritative sources. For the most important pages, use browserRead to get full content. Collect: key facts, dates, people involved, evidence, controversies, and recent developments. Return ALL information in a well-structured format with sources cited. Be thorough — search for at least 5 different queries.` }],
                maxSteps: 12,
              }),
              signal: AbortSignal.timeout(90000),
            },
            1
          );
          
          if (mastraRes.ok) {
            const data = await mastraRes.json();
            const text = data.text || '';
            if (text.length > 100) {
              sections.push(`## 🌐 Результаты веб-поиска

${text.slice(0, 12000)}

`);
              console.log(`[DeepResearch] Mastra: ${text.length} chars`);
            } else {
              sections.push(`*Веб-поиск не дал содержательных результатов*

`);
            }
          } else {
            sections.push(`*Веб-поиск временно недоступен*

`);
          }
        } catch (err) {
          console.error(`[DeepResearch] Mastra error:`, err.message);
          sections.push(`*Веб-поиск временно недоступен: ${err.message}*

`);
        }
        
        // ---- Step 3: YouTube ----
        try {
          const { youtubeSearch } = await import('../tools/browser-fast.mjs');
          const ytResult = await youtubeSearch(topic);
          
          if (ytResult?.results?.length > 0) {
            sections.push(`## 🎬 YouTube
`);
            for (const video of ytResult.results.slice(0, 5)) {
              sections.push(`- [${video.title}](${video.url})
`);
            }
            sections.push(`
`);
            console.log(`[DeepResearch] YouTube: ${ytResult.results.length} videos`);
          }
        } catch (err) {
          console.error(`[DeepResearch] YouTube error:`, err.message);
        }
        
        // ---- Footer ----
        sections.push(`
---
*📅 Исследование выполнено: ${new Date().toLocaleString()}*`);
        
        const report = sections.join(`
`).trim();
        console.log(`[DeepResearch] Report: ${report.length} chars`);
        
        this._sendJSON(res, 200, { report });
        return;
      }
      
      // ===== REMINDER API =====
      if (url.pathname === '/api/reminder' && req.method === 'POST') {
        const body = await this._handleBody(req);
        const { action, params } = JSON.parse(body);
        if (!action) { this._sendJSON(res, 400, { error: 'Missing action' }); return; }
        
        const { createReminder, listReminders, deleteReminder } = await import('../tools/reminder-store.mjs');
        
        let result;
        switch (action) {
          case 'create': {
            const { text, datetime } = params || {};
            if (!text || !datetime) { this._sendJSON(res, 400, { error: 'Missing text or datetime' }); return; }
            const reminder = createReminder({ text, datetime });
            result = { success: true, reminder, message: `Напоминание создано: "${text}" на ${new Date(datetime).toLocaleString()}` };
            break;
          }
          case 'list': {
            const reminders = listReminders();
            result = { success: true, reminders, count: reminders.length };
            break;
          }
          case 'delete': {
            const { id, text } = params || {};
            if (!id && !text) { this._sendJSON(res, 400, { error: 'Missing id or text' }); return; }
            deleteReminder({ id, text });
            result = { success: true, message: 'Напоминание удалено' };
            break;
          }
          default:
            this._sendJSON(res, 400, { error: `Unknown action: ${action}` });
            return;
        }
        
        this._sendJSON(res, 200, result);
        console.log(`[Reminder API] ${action}:`, JSON.stringify(result).slice(0, 150));
        return;
      }
      
      // ===== STATIC FILES =====
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const filePath = join(this.uiDir, 'index.html');
        const content = await readFile(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
        return;
      }
      
      let path = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = join(this.uiDir, path);
      
      if (!filePath.startsWith(this.uiDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      
      const content = await readFile(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': this._mimeMap[ext] || 'application/octet-stream' });
      res.end(content);
      
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        console.error('[Core] Error:', err.message);
        res.writeHead(500);
        res.end('Server error');
      }
    }
  }
}
