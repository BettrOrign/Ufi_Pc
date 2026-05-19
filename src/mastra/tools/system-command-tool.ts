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

function isAllowed(command: string): { ok: boolean; reason?: string } {
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
    return { pid: child.pid, message: `Launched '${cmd}' in background (PID: ${child.pid})` };
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
        const output = { message: check.reason, error: check.reason, exitCode: -1 };
        console.log(`━━━ \x1b[1;36m\u{1F6E1} system-command\x1b[0m ━━━ \x1b[2m${new Date().toLocaleTimeString()}\x1b[0m ━━━`);
        console.log(`\x1b[1;33m\u{1F4E5} Input:\x1b[0m  ${JSON.stringify(input)}`);
        console.log(`\x1b[1;31m\u{1F6AB} Blocked:\x1b[0m ${check.reason}`);
        console.log(`\x1b[2m\u{23F1} ${Math.round(performance.now() - start)}ms\x1b[0m`);
        console.log(`\x1b[90m\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\x1b[0m`);
        return output;
      }

      let output;
      if (background) {
        const bg = launchBackground(command, args);
        output = { message: bg.message, pid: bg.pid, stdout: '', stderr: '', exitCode: 0 };
      } else {
        const result = await runCommand(command, args);
        const stdoutTrimmed = result.stdout.length > 2000 ? result.stdout.slice(0, 2000) + `\n... [${result.stdout.length - 2000} more chars]` : result.stdout;
        const stderrTrimmed = result.stderr.length > 1000 ? result.stderr.slice(0, 1000) + `...` : result.stderr;
        output = {
          stdout: stdoutTrimmed,
          stderr: stderrTrimmed,
          exitCode: result.exitCode,
          message: result.exitCode === 0 ? `Command '${command}' completed` : `Command '${command}' failed (exit: ${result.exitCode})`,
        };
      }

      console.log(`━━━ \x1b[1;36m\u{1F6E1} system-command\x1b[0m ━━━ \x1b[2m${new Date().toLocaleTimeString()}\x1b[0m ━━━`);
      console.log(`\x1b[1;33m\u{1F4E5} Input:\x1b[0m  ${JSON.stringify(input)}`);
      if (output.stdout) console.log(`\x1b[1;32m\u{1F4E4} stdout:\x1b[0m ${output.stdout.slice(0, 200)}`);
      if (output.stderr) console.log(`\x1b[1;31m\u{1F4E4} stderr:\x1b[0m ${output.stderr.slice(0, 200)}`);
      console.log(`\x1b[2m\u{23F1} ${Math.round(performance.now() - start)}ms | exit: ${output.exitCode ?? '-'}\x1b[0m`);
      console.log(`\x1b[90m\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\x1b[0m`);
      return output;
    } catch (err) {
      const output = { message: 'Error executing command', error: (err as Error).message, exitCode: -1 };
      return output;
    }
  },
});
