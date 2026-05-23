import { addImageMessage } from '../../interface/chat.js';
import { wrapHandler } from './shared.js';

export const handleShowImage = wrapHandler(async (args) => {
  const { source } = args;
  console.log('[ShowImage]', source);
  addImageMessage(source || '');
  return { success: true };
});
