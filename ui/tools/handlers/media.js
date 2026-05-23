import { safeFetch, wrapHandler } from './shared.js';

async function execMedia(action) {
  const playerctlAction = action === 'play' ? 'play' 
    : action === 'pause' ? 'pause'
    : action === 'play-pause' ? 'play-pause'
    : action;
  const result = await safeFetch('/api/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'playerctl', args: [playerctlAction], background: false }),
  }, 10000);
  if (!result.ok) return { error: result.error };
  return result.data;
}

export const handleMediaPlay = wrapHandler(async () => {
  return execMedia('play');
});

export const handleMediaPause = wrapHandler(async () => {
  return execMedia('pause');
});

export const handleMediaStop = wrapHandler(async () => {
  return execMedia('stop');
});

export const handleMediaNext = wrapHandler(async () => {
  return execMedia('next');
});

export const handleMediaPrevious = wrapHandler(async () => {
  return execMedia('previous');
});

export const handleMediaVolumeUp = wrapHandler(async () => {
  return execMedia('volume up 10%');
});

export const handleMediaVolumeDown = wrapHandler(async () => {
  return execMedia('volume down 10%');
});
