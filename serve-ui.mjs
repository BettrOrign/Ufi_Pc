import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// Load .env into process.env
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const uiDir = join(__dirname, 'ui');
const PORT = 3000;

const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'curl', 'echo', 'which', 'pwd', 'whoami', 'uname',
  'date', 'ps', 'grep', 'head', 'tail', 'wc', 'sort', 'find',
  'mkdir', 'touch', 'cp', 'mv', 'rm', 'chmod', 'df', 'du',
  'free', 'uptime', 'id', 'env', 'printenv', 'ping', 'wget',
  'npm', 'node', 'npx', 'tsc', 'git',
  'Telegram', 'kitty', 'haruna', 'nautilus',
]);

const BLOCKED = ['sudo', 'su ', 'passwd', 'dd ', 'mkfs', 'chown', 'chgrp', 'shutdown', 'reboot'];

function runCommand(cmd, args) {
  // Defense-in-depth: handle cases where cmd accidentally contains the program + arguments
  // (e.g., Gemini might send command="node browser-read.mjs" as one string)
  let command = cmd;
  let commandArgs = args || [];
  
  if (command.includes(' ')) {
    const parts = command.split(' ');
    command = parts[0];
    commandArgs = [...parts.slice(1), ...(args || [])];
  }
  
  // Strip surrounding quotes from args (Gemini often wraps URLs in quotes)
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

async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // Success — return immediately
      if (response.ok) return response;
      // Rate limit (429) or upstream error (502) — retry with backoff
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
      // Non-retryable error — return as-is
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // 🖥️ System command execution
    if (url.pathname === '/api/exec') {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const { command, args = [], background = false } = JSON.parse(body);

          if (!ALLOWED_COMMANDS.has(command)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Command '${command}' not allowed`, stdout: '', stderr: '', exitCode: -1 }));
            return;
          }
          for (const b of BLOCKED) {
            if (command.includes(b)) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Blocked pattern: ${b}`, stdout: '', stderr: '', exitCode: -1 }));
              return;
            }
          }

          if (background) {
            const child = spawn(command, args, { detached: true, stdio: 'ignore', cwd: process.cwd() });
            child.unref();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ stdout: `Launched ${command} (PID: ${child.pid})`, stderr: '', exitCode: 0, pid: child.pid }));
            console.log('[API] exec background:', command, args.join(' '));
          } else {
            const result = await runCommand(command, args);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            console.log('[API] exec:', command, args.join(' '), '- exit:', result.exitCode);
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message, stdout: '', stderr: '', exitCode: -1 }));
        }
      });
      return;
    }

    // 🔍 Search API proxy — bypass CORS
    if (url.pathname === '/api/search') {
      const query = url.searchParams.get('q');
      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing query parameter' }));
        return;
      }
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'Ufi/1.0' },
      });
      const data = await response.json();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(data));
      console.log('[API] Search proxy:', query, '-', response.status);
      return;
    }

    // ⚡ Fast Path — Intent Router (bypass LLM for known commands)
    if (url.pathname === '/api/intent/route' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const { text } = JSON.parse(body);
          if (!text) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing text' }));
            return;
          }

          const { detectIntent } = await import('./src/intent-router.mjs');
          const intent = detectIntent(text);

          if (!intent) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ matched: false }));
            return;
          }

          console.log(`[IntentRouter] Matched: ${intent.type} →`, JSON.stringify(intent));

          let result;

          switch (intent.type) {
            case 'browse': {
              const { goto } = await import('./src/browser-fast.mjs');
              result = await goto(intent.url);
              break;
            }
            case 'youtube': {
              const { youtubeSearch } = await import('./src/browser-fast.mjs');
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
              const { spawn } = await import('node:child_process');
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
              const { search } = await import('./src/browser-fast.mjs');
              result = await search(intent.query);
              break;
            }
            case 'telegram_send': {
              const lowerRaw = (intent.raw || '').toLowerCase();
              if (lowerRaw.includes('избранные')) {
                try {
                  const { sendToSavedMessages } = await import('./src/telegram-client.mjs');
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
                const { getRecentMessages, getUnreadMessages } = await import('./src/telegram-client.mjs');
                const isUnread = intent.subtype === 'unread' || (intent.raw || '').toLowerCase().includes('непрочитан');
                
                if (isUnread) {
                  const msgs = await getUnreadMessages(10);
                  if (msgs.length === 0) {
                    result = { success: true, message: '✅ Непрочитанных сообщений нет' };
                  } else {
                    const text = msgs.map((m, i) => 
                      `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}`
                    ).join('\n');
                    result = { success: true, message: `📨 Непрочитанные сообщения:\n${text}` };
                  }
                } else {
                  const msgs = await getRecentMessages(10);
                  if (msgs.length === 0) {
                    result = { success: true, message: '✅ Нет последних сообщений' };
                  } else {
                    const text = msgs.map((m, i) => 
                      `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}${m.unread ? ' [❗]' : ''}`
                    ).join('\n');
                    result = { success: true, message: `📨 Последние сообщения:\n${text}` };
                  }
                }
              } catch (e) {
                result = { success: false, message: 'Ошибка Telegram: ' + e.message };
              }
              break;
            }
            default:
              result = { success: false, message: 'Unknown intent type' };
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ matched: true, intent, result }));
          console.log(`[IntentRouter] Result:`, JSON.stringify(result).slice(0, 200));
        } catch (err) {
          console.error('[IntentRouter] Error:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 🧠 Mastra Agent proxy — call Mastra agents from Gemini (with Fast Path)
    if (url.pathname === '/api/mastra/agent/generate' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const { agentId, task } = JSON.parse(body);
          if (!agentId || !task) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing agentId or task' }));
            return;
          }

          // ⚡ Fast Path — Intent Router
          const { detectIntent } = await import('./src/intent-router.mjs');
          let intent = detectIntent(task);

          // For telegram_send to contacts (not "избранные"), skip fast path and let Mastra Agent handle it
          if (intent && intent.type === 'telegram_send') {
            const lowerRaw = (intent.raw || '').toLowerCase();
            if (!lowerRaw.includes('избранные') && !lowerRaw.includes(' me') && lowerRaw !== 'me') {
              console.log(`[FastPath] telegram_send to contact, falling through to slow path`);
              intent = null; // Force slow path
            }
          }
          if (intent) {
            console.log(`[FastPath] "${task}" → ${intent.type}`, JSON.stringify(intent));

            let result;

            switch (intent.type) {
              case 'browse': {
                const { goto } = await import('./src/browser-fast.mjs');
                result = await goto(intent.url);
                break;
              }
              case 'youtube': {
                const { youtubeSearch } = await import('./src/browser-fast.mjs');
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
                const { spawn } = await import('node:child_process');
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
                const { search } = await import('./src/browser-fast.mjs');
                result = await search(intent.query);
                break;
              }
              case 'telegram_send': {
                try {
                  const { sendToSavedMessages } = await import('./src/telegram-client.mjs');
                  const r = await sendToSavedMessages(intent.text);
                  result = { success: true, message: 'Сообщение отправлено в Избранные ✅' };
                } catch (e) {
                  result = { success: false, message: 'Ошибка Telegram: ' + e.message };
                }
                break;
              }
              case 'telegram_read': {
                try {
                  const { getRecentMessages, getUnreadMessages } = await import('./src/telegram-client.mjs');
                  const isUnread = intent.subtype === 'unread' || (intent.raw || '').toLowerCase().includes('непрочитан');
                  
                  if (isUnread) {
                    const msgs = await getUnreadMessages(10);
                    if (msgs.length === 0) {
                      result = { success: true, message: '✅ Непрочитанных сообщений нет' };
                    } else {
                      const text = msgs.map((m, i) => 
                        `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}`
                      ).join('\n');
                      result = { success: true, message: `📨 Непрочитанные сообщения:\n${text}` };
                    }
                  } else {
                    const msgs = await getRecentMessages(10);
                    if (msgs.length === 0) {
                      result = { success: true, message: '✅ Нет последних сообщений' };
                    } else {
                      const text = msgs.map((m, i) => 
                        `${i + 1}. ${m.chatName} — ${m.from}: ${m.text}${m.unread ? ' [❗]' : ''}`
                      ).join('\n');
                      result = { success: true, message: `📨 Последние сообщения:\n${text}` };
                    }
                  }
                } catch (e) {
                  result = { success: false, message: 'Ошибка Telegram: ' + e.message };
                }
                break;
              }
              default:
                result = { success: false, message: 'Unknown intent' };
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result: result.message, fastPath: true, matched: true, intent: intent.type }));
            console.log(`[FastPath] Result:`, result.message?.slice(0, 100));
            return;
          }

          // 🐢 Slow path — forward to Mastra agent
          console.log(`[SlowPath] "${task}" → Mastra ${agentId}`);
          const mastraRes = await fetchWithRetry(
            `http://localhost:4111/api/agents/${agentId}/generate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: [{ role: 'user', content: task }], maxSteps: 20 }),
              signal: AbortSignal.timeout(30000),
            },
            3
          );

          if (!mastraRes.ok) {
            const errText = await mastraRes.text();
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Mastra error: ${mastraRes.status}`, detail: errText }));
            return;
          }

          const data = await mastraRes.json();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: data.text || data, fastPath: false }));
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Mastra agent error: ' + (err.message || err) }));
        }
      });
      return;
    }

    // 🖼️ Image proxy — serve local images for chat display
    if (url.pathname === '/api/image' && req.method === 'GET') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing path parameter' }));
        return;
      }
      // Security: only allow images from common paths
      if (!filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not an image file' }));
        return;
      }
      try {
        const content = await readFile(filePath);
        const ext = extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'image/png' });
        res.end(content);
      } catch (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found: ' + filePath }));
      }
      return;
    }

    // 🌐 Image proxy — fetch remote images (avoid CSP)
    if (url.pathname === '/api/image-proxy' && req.method === 'GET') {
      const imageUrl = url.searchParams.get('url');
      if (!imageUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing url parameter' }));
        return;
      }
      try {
        const response = await fetch(imageUrl, {
          headers: { 'User-Agent': 'Ufi/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to fetch: ' + response.status }));
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
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Image proxy error: ' + err.message }));
      }
      return;
    }

    // Inject API key into index.html
    if (url.pathname === '/' || url.pathname === '/index.html') {
      let html = await readFile(join(uiDir, 'index.html'), 'utf-8');
      html = html.replace('</head>', '<script>window.__GEMINI_API_KEY__=' + JSON.stringify(GEMINI_API_KEY) + '</script>\n</head>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Serve static files
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = join(uiDir, path);
    
    if (!filePath.startsWith(uiDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
    } else {
      console.error('[UI] Error:', err.message);
      res.writeHead(500);
      res.end('Server error');
    }
  }
});

server.listen(PORT, () => {
  console.log(`
  [1;36m🎨 Ufi Live UI: http://localhost:${PORT}[0m
`);
});
