import { safeFetch, wrapHandler } from './shared.js';

async function callTelegram(action, params) {
  const result = await safeFetch('/api/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params: params || {} }),
  }, 15000);
  if (!result.ok) return { error: result.error };
  return result.data;
}

export const handleTelegramSend = wrapHandler(async (args) => {
  return callTelegram('send', args);
});

export const handleTelegramSearchContact = wrapHandler(async (args) => {
  return callTelegram('searchContact', args);
});

export const handleTelegramGetRecent = wrapHandler(async (args) => {
  return callTelegram('getRecent', args);
});

export const handleTelegramGetUnread = wrapHandler(async (args) => {
  return callTelegram('getUnread', args);
});
