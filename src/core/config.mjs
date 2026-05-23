const PORT = parseInt(process.env.PORT) || 3000;
const DEBUG = !!process.env.DEBUG;

const ALLOWED_COMMANDS = new Set([
  'ls', 'echo', 'which', 'pwd', 'whoami', 'uname',
  'date', 'ps', 'grep', 'head', 'tail', 'wc', 'sort', 'find',
  'mkdir', 'touch', 'cp', 'mv', 'chmod', 'df', 'du',
  'free', 'uptime', 'id', 'env', 'printenv', 'ping',
  'tsc', 'git',
  'playerctl', 'pactl',
  'Telegram', 'kitty', 'haruna', 'nautilus',
  'cat', 'curl', 'npm', 'node', 'npx', 'wget',
]);

const BLOCKED_SUBSTRINGS = ['sudo', 'su ', 'passwd', 'dd ', 'mkfs', 'chown', 'chgrp', 'shutdown', 'reboot', 'init'];

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

const debug = DEBUG ? console.log : () => {};
const debugErr = DEBUG ? console.error : () => {};

export {
  PORT,
  DEBUG,
  ALLOWED_COMMANDS,
  BLOCKED_SUBSTRINGS,
  MIME_MAP,
  debug,
  debugErr,
};
