import { safeFetch, wrapHandler } from './shared.js';

export const handleSystemCommand = wrapHandler(async (args) => {
  const { command, args: cmdArgs, background } = args;
  console.log('[SystemCommand]', command, (cmdArgs || []).join(' '));

  const result = await safeFetch('/api/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args: cmdArgs || [], background: background || false }),
  }, 30000); // 30s timeout for commands

  if (!result.ok) {
    return { error: result.error };
  }
  return result.data;
});
