import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const __env = existsSync('.env') ? Object.fromEntries(readFileSync('.env','utf-8').split('\n').filter(l=>l.trim()).map(l=>l.split('=').map(s=>s.trim()))) : {};
const GEMINI_API_KEY = __env.GEMINI_API_KEY || '';
const uiDir = join(__dirname, 'ui');
const PORT = 3000;

const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'curl', 'echo', 'which', 'pwd', 'whoami', 'uname',
  'date', 'ps', 'grep', 'head', 'tail', 'wc', 'sort', 'find',
  'mkdir', 'touch', 'cp', 'mv', 'rm', 'chmod', 'df', 'du',
  'free', 'uptime', 'id', 'env', 'printenv', 'ping', 'wget',
  'npm', 'node', 'npx', 'tsc', 'git',
  'Telegram', 'kitty', 'haruna', 'nautilus',
  'chromium',
  'browser-control',
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

    // 🧠 Mastra Agent proxy — call Mastra agents from Gemini
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

          const mastraRes = await fetch(`http://localhost:4111/api/agents/${agentId}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: task }] }),
            signal: AbortSignal.timeout(30000),
          });

          if (!mastraRes.ok) {
            const errText = await mastraRes.text();
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Mastra error: ${mastraRes.status}`, detail: errText }));
            return;
          }

          const data = await mastraRes.json();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: data.text || data }));
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
