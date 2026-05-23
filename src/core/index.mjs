import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { EventBus } from './event-bus.mjs';
import { ALLOWED_COMMANDS, BLOCKED_SUBSTRINGS, MIME_MAP, debug, debugErr, PORT } from './config.mjs';
import { handleApiRequest, sendJSON } from './routes/api.mjs';
import { handleGeminiWs } from './ws/gemini-proxy.mjs';
import { mastra } from '../mastra/index.mjs';

export class Core {
  constructor(options = {}) {
    this.port = options.port || PORT;
    this.uiDir = resolve(process.cwd(), 'ui');
    this.distDir = resolve(process.cwd(), 'dist');
    this.events = new EventBus();
    this._services = new Map();
    this._recoveryAttempts = new Map();
    this._recovering = false;
    this._startTime = Date.now();
    this._heartbeatTimer = null;
    this._reminderTimer = null;
    this._wsClients = new Set();
    this._wsServer = null;
    this._geminiWss = null;
    this.server = null;
    this._hasDist = null;
  }

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
    this.server = createServer(this._handleRequest.bind(this));

    const { WebSocketServer, WebSocket } = await import('ws');

    this._wsServer = new WebSocketServer({ noServer: true });
    this._wsServer.on('connection', (ws) => {
      this._wsClients.add(ws);
      ws.send(JSON.stringify({ type: 'status', services: this._getServicesStatus(), uptime: this._getUptime() }));
      ws.on('close', () => this._wsClients.delete(ws));
    });

    this._geminiWss = new WebSocketServer({ noServer: true });
    this._geminiWss.on('connection', (clientWs, req) => {
      handleGeminiWs(clientWs, WebSocket);
    });

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
        this._startHeartbeat();
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

  // --- Private ---

  _registerServices() {
    this.registerService('mastra', {
      check: async () => {
        try {
          const { mastra: m } = await import('../mastra/index.mjs');
          return !!m && !!m.getAgent('agent');
        } catch { return false; }
      }
    });

    this.registerService('telegram', {
      check: async () => {
        try {
          const { getConnectionStatus } = await import('../tools/telegram-client.mjs');
          return getConnectionStatus() === 'connected';
        } catch { return false; }
      }
    });

    this.registerService('browser', {
      check: async () => {
        try {
          const { getBrowserStatus } = await import('../tools/browser-fast.mjs');
          return getBrowserStatus() === 'connected';
        } catch { return false; }
      }
    });

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
      const due = await getDueReminders();
      for (const reminder of due) {
        debug(`[Reminder] Due: "${reminder.text}"`);
        await markNotified(reminder.id);
        this._broadcast({ type: 'reminder', text: reminder.text, datetime: reminder.datetime });
      }
      await cleanupOld();
    } catch {
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
        if (status === 'disconnected' || status === 'error') {
          this._attemptRecovery(name);
        }
      }
    }
  }

  async _attemptRecovery(name) {
    if (this._recovering) return;
    this._recovering = true;
    try {
      const rec = this._recoveryAttempts.get(name) || { count: 0, lastAttempt: 0 };
      const now = Date.now();

      if (rec.count >= 3) return;
      if (now - rec.lastAttempt < 60000 * Math.pow(2, rec.count)) return;

      rec.count++;
      rec.lastAttempt = now;
      this._recoveryAttempts.set(name, rec);

      debug(`[Core] Auto-recovery for ${name} (attempt ${rec.count})`);

    } finally {
      this._recovering = false;
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
    const MAX_BODY = 1_048_576;
    return new Promise((resolve, reject) => {
      let body = '';
      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error('Request body read timeout'));
      }, 30000);
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) {
          req.destroy();
          clearTimeout(timeout);
          reject(new Error('Request body too large (max 1MB)'));
        }
      });
      req.on('end', () => {
        clearTimeout(timeout);
        resolve(body);
      });
      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
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

  async _handleRequest(req, res) {
    try {
      const url = new URL(req.url, `http://localhost:${this.port}`);

      // API routes
      let body = null;
      if (req.method === 'POST' || req.method === 'PUT') {
        body = await this._handleBody(req);
      }

      if (url.pathname.startsWith('/api/')) {
        const result = await handleApiRequest(this, req, res, url, body);
        if (result !== null) return;
      }

      // Static files
      if (this._hasDist === null) {
        this._hasDist = existsSync(join(this.distDir, 'index.html'));
      }

      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

      if (pathname === '/index.html') {
        if (this._hasDist) {
          const filePath = join(this.distDir, 'index.html');
          const content = await readFile(filePath, 'utf-8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
          return;
        }
        const filePath = join(this.uiDir, 'interface', 'index.html');
        const content = await readFile(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
        return;
      }

      // Try dist/ first
      if (this._hasDist) {
        const distPath = join(this.distDir, pathname);
        if (distPath.startsWith(this.distDir)) {
          try {
            const content = await readFile(distPath);
            const ext = extname(distPath);
            res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
            res.end(content);
            return;
          } catch (err) {
            if (err.code !== 'ENOENT') throw err;
          }
        }
      }

      const filePath = join(this.uiDir, pathname);
      if (!filePath.startsWith(this.uiDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const content = await readFile(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
      res.end(content);

    } catch (err) {
      if (err?.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        console.error('[Core] Error:', err?.message || err);
        res.writeHead(500);
        res.end('Server error');
      }
    }
  }
}
