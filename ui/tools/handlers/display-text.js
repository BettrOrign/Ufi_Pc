import { addAssistantMessage } from '../../interface/chat.js';
import { scrollToBottom } from '../../interface/ui-helpers.js';
import { wrapHandler } from './shared.js';

export const handleDisplayText = wrapHandler(async (args) => {
  const { text } = args;
  console.log('[DisplayText]', text?.slice(0, 100));
  addAssistantMessage(text || '');
  scrollToBottom();
  return { success: true };
});
