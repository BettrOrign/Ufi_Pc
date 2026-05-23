export const ALLOWED_COMMANDS = new Set([
  'ls', 'echo', 'which', 'pwd', 'whoami', 'uname',
  'date', 'ps', 'grep', 'head', 'tail', 'wc', 'sort', 'find',
  'mkdir', 'touch', 'cp', 'mv', 'chmod', 'df', 'du',
  'free', 'uptime', 'id', 'env', 'printenv', 'ping',
  'tsc', 'git',
  'playerctl', 'pactl',
  'Telegram', 'kitty', 'haruna', 'nautilus',
  'cat', 'curl', 'npm', 'node', 'npx', 'wget',
]);

export const BLOCKED_SUBSTRINGS = ['sudo', 'su ', 'passwd', 'dd ', 'mkfs', 'chown', 'chgrp', 'shutdown', 'reboot', 'init'];
