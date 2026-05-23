import { safeFetch, wrapHandler } from './shared.js';

async function callReminders(action, data) {
  const result = await safeFetch('/api/reminder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params: data || {} }),
  }, 10000);
  if (!result.ok) return { error: result.error };
  return result.data;
}

export const handleSetReminder = wrapHandler(async (args) => {
  return callReminders('create', { text: args.text, datetime: args.datetime });
});

export const handleListReminders = wrapHandler(async () => {
  return callReminders('list');
});

export const handleDeleteReminder = wrapHandler(async (args) => {
  return callReminders('delete', { id: args.id, text: args.text });
});
