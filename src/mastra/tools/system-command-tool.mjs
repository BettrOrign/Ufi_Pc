import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { ALLOWED_COMMANDS, BLOCKED_SUBSTRINGS } from '../../core/command-config.mjs';

const debug = process.env.DEBUG ? console.log : () => {};

function isAllowed(command) {
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

function runCommand(cmd, args) {
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

function launchBackground(cmd, args) {
  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    });
    child.unref();
    return { pid: child.pid ?? null, message: `Launched '${cmd}' in background (PID: ${child.pid})` };
  } catch (err) {
    return { pid: null, message: `Failed to launch '${cmd}': ${err.message}` };
  }
}

export const systemCommandTool = createTool({
  id: 'system-command',
  description: 'Execute whitelisted system commands (ls, cat, curl, git, node, npm, etc.) or launch apps in background. Returns stdout, stderr, exit code.',
  inputSchema: z.object({
    command: z.string().describe('Command to run (must be in allowed list)'),
    args: z.array(z.string()).optional().describe('Command arguments (e.g., ["-la"], ["README.md"])'),
    background: z.boolean().optional().default(false).describe('If true, run in background and return immediately'),
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
        debug(`━━━ \x1b[1;36m🛡 system-command\x1b[0m ━━━ \x1b[2m${new Date().toLocaleTimeString()}\x1b[0m ━━━`);
        debug(`\x1b[1;33m📥 Input:\x1b[0m  ${JSON.stringify(input)}`);
        debug(`\x1b[1;31m🚫 Blocked:\x1b[0m ${check.reason}`);
        debug(`\x1b[2m⏱ ${Math.round(performance.now() - start)}ms\x1b[0m`);
        debug(`\x1b[90m────────────────────────────────────────────────────────\x1b[0m`);
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

      debug(`━━━ \x1b[1;36m🛡 system-command\x1b[0m ━━━ \x1b[2m${new Date().toLocaleTimeString()}\x1b[0m ━━━`);
      debug(`\x1b[1;33m📥 Input:\x1b[0m  ${JSON.stringify(input)}`);
      if (result.stdout) debug(`\x1b[1;32m📤 stdout:\x1b[0m ${result.stdout.slice(0, 200)}`);
      if (result.stderr) debug(`\x1b[1;31m📤 stderr:\x1b[0m ${result.stderr.slice(0, 200)}`);
      debug(`\x1b[2m⏱ ${Math.round(performance.now() - start)}ms | exit: ${result.exitCode ?? '-'}\x1b[0m`);
      debug(`\x1b[90m────────────────────────────────────────────────────────\x1b[0m`);
      return result;
    } catch (err) {
      return { message: 'Error executing command', stdout: '', stderr: '', exitCode: -1, error: err.message };
    }
  },
});
