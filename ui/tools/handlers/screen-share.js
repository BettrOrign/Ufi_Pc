import { startScreenShare, stopScreenShare } from '../screen-capture.js';
import { wrapHandler } from './shared.js';

export const handleToggleScreenShare = wrapHandler(async (args) => {
  const { action } = args;

  if (action === 'start') {
    return await startScreenShare();
  } else if (action === 'stop') {
    return stopScreenShare();
  } else {
    return { error: `Unknown action: ${action}. Use 'start' or 'stop'.` };
  }
});
