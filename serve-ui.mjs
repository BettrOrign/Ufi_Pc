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
  'telegram-desktop', 'kitty', 'haruna', 'nautilus',
]);

const BLOCKED = ['sudo', 'su ', 'passwd', 'dd ', 'mkfs', 'chown', 'chgrp', 'shutdown', 'reboot'];

function runCommand(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
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
