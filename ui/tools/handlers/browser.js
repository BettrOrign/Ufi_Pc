import { safeFetch, wrapHandler } from './shared.js';

async function callBrowser(action, params) {
  const result = await safeFetch('/api/browser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params: params || {} }),
  }, 20000);
  if (!result.ok) return { error: result.error };
  return result.data;
}

export const handleYoutubeSearch = wrapHandler(async (args) => {
  return callBrowser('youtube-search', args);
});

export const handleYoutubePlay = wrapHandler(async (args) => {
  return callBrowser('youtube-play', args);
});

export const handleBrowserGo = wrapHandler(async (args) => {
  return callBrowser('goto', args);
});
