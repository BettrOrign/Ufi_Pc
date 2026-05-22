import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn, execSync } from 'node:child_process';

const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'curl', 'echo', 'which', 'pwd', 'whoami', 'uname',
  'date', 'ps', 'grep', 'head', 'tail', 'wc', 'sort', 'find',
  'mkdir', 'touch', 'cp', 'mv', 'chmod', 'df', 'du',
  'free', 'uptime', 'id', 'env', 'printenv', 'ping', 'wget',
  'npm', 'node', 'npx', 'tsc', 
  'Telegram', 'kitty', 'haruna', 'nautilus',
]);

const BLOCKED_SUBSTRINGS = ['sudo', 'su ', 'passwd', 'dd ', 'mkfs', 'chown', 'chgrp', 'shutdown', 'reboot', 'init'];

function isAllowed(command: string): { ok: false; reason: string } | { ok: true } {
  if (!ALLOWED_COMMANDS.has(command)) {
    return { ok: false, reason: `Command '${command}' is not in the allowed list` };
  }
  for (const blocked of BLOCKED_SUBSTRINGS) {
    if (command.includes(blocked)) {
      return { ok: false, reason: `Command contains blocked pattern: '${blocked}'` };
    }
  }
  return { ok: true };
}

function runCommand(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? -1 });
    });
    child.on('error', (err) => {
      resolve({ stdout: '', stderr: err.message, exitCode: -1 });
    });
  });
}

function launchBackground(cmd: string, args: string[]): { pid: number | null; message: string } {
  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    });
    child.unref();
    return { pid: child.pid ?? null, message: `Launched '${cmd}' in background (PID: ${child.pid})` };
  } catch (err) {
    return { pid: null, message: `Failed to launch '${cmd}': ${(err as Error).message}` };
  }
}

export const systemCommandTool = createTool({
  id: 'system-command',
  description: 'Execute whitelisted system commands (ls, cat, curl, git, node, npm, etc.) or launch apps in background. Returns stdout, stderr, exit code.',
  inputSchema: z.object({
    command: z.string().describe('Command to run (must be in allowed list: ls, cat, curl, echo, which, pwd, date, ps, grep, head, tail, wc, mkdir, touch, cp, mv, rm, find, df, du, free, uptime, ping, wget, git, npm, node, npx, tsc, telegram-desktop, kitty, haruna, nautilus, and more)'),
    args: z.array(z.string()).optional().describe('Command arguments (e.g., ["-la"], ["README.md"], ["-s", "https://..."])'),
    background: z.boolean().optional().default(false).describe('If true, run in background and return immediately (for launching apps like Telegram)'),
  }),
  outputSchema: z.object({
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    pid: z.number().nullable().optional(),
    message: z.string(),
    error: z.string().optional(),
  }),
  execute: async ({ command, args = [], background = false }) => {
    const start = performance.now();
    const input = { command, args: args.join(' '), background };

    try {
      const check = isAllowed(command);
      if (!check.ok) {
        console.log(`━━━ \x1b[1;36m🛡 system-command\x1b[0m ━━━ \x1b[2m${new Date().toLocaleTimeString()}\x1b[0m ━━━`);
        console.log(`\x1b[1;33m📥 Input:\x1b[0m  ${JSON.stringify(input)}`);
        console.log(`\x1b[1;31m🚫 Blocked:\x1b[0m ${check.reason}`);
        console.log(`\x1b[2m⏱ ${Math.round(performance.now() - start)}ms\x1b[0m`);
        console.log(`\x1b[90m────────────────────────────────────────────────────────\x1b[0m`);
        return { message: check.reason, stdout: '', stderr: '', exitCode: -1, error: check.reason };
      }

      const bgResult = background ? launchBackground(command, args) : null;

      let result;
      if (bgResult) {
        result = { stdout: '', stderr: '', exitCode: 0, message: bgResult.message, pid: bgResult.pid };
      } else {
        const cmdResult = await runCommand(command, args);
        const stdoutTrimmed = cmdResult.stdout.length > 2000 ? cmdResult.stdout.slice(0, 2000) + `\n... [${cmdResult.stdout.length - 2000} more chars]` : cmdResult.stdout;
        const stderrTrimmed = cmdResult.stderr.length > 1000 ? cmdResult.stderr.slice(0, 1000) + `...` : cmdResult.stderr;
        result = {
          stdout: stdoutTrimmed,
          stderr: stderrTrimmed,
          exitCode: cmdResult.exitCode,
          message: cmdResult.exitCode === 0 ? `Command '${command}' completed` : `Command '${command}' failed (exit: ${cmdResult.exitCode})`,
        };
      }

      console.log(`━━━ \x1b[1;36m🛡 system-command\x1b[0m ━━━ \x1b[2m${new Date().toLocaleTimeString()}\x1b[0m ━━━`);
      console.log(`\x1b[1;33m📥 Input:\x1b[0m  ${JSON.stringify(input)}`);
      if (result.stdout) console.log(`\x1b[1;32m📤 stdout:\x1b[0m ${result.stdout.slice(0, 200)}`);
      if (result.stderr) console.log(`\x1b[1;31m📤 stderr:\x1b[0m ${result.stderr.slice(0, 200)}`);
      console.log(`\x1b[2m⏱ ${Math.round(performance.now() - start)}ms | exit: ${result.exitCode ?? '-'}\x1b[0m`);
      console.log(`\x1b[90m────────────────────────────────────────────────────────\x1b[0m`);
      return result;
    } catch (err) {
      return { message: 'Error executing command', stdout: '', stderr: '', exitCode: -1, error: (err as Error).message };
    }
  },
});
