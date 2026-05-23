import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}

async function getTg() {
  return await import('../../tools/telegram-client.mjs');
}

export const telegramSendTool = createTool({
  id: 'telegram-send',
  description: 'Send a message to a Telegram chat or contact. For "Saved Messages" use chat="me". For any contact, you can use their name (e.g. "Анвар"), username, or phone number.',
  inputSchema: z.object({
    chat: z.string().describe('Who to send to: "me" or "избранные" for Saved Messages, or a contact name (like "Анвар"), username, or phone'),
    text: z.string().describe('Message text to send'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
    contact: z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string().optional(),
      username: z.string().optional(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ chat, text }) => {
    try {
      const tg = await getTg();
      const isSaved = chat === 'me' || chat === 'saved' || chat === 'избранные';

      if (isSaved) {
        const r = await tg.sendToSavedMessages(text);
        return { success: true, messageId: r.messageId };
      }

      const r = await tg.sendToContactByName(chat, text);
      return { success: true, messageId: r.messageId, contact: r.contact };
    } catch (err) {
      try {
        const tg = await getTg();
        const r = await tg.sendToChat(chat, text);
        return { success: true, messageId: r.messageId };
      } catch (fallbackErr) {
        return { success: false, error: errMsg(fallbackErr) };
      }
    }
  },
});

export const telegramSearchTool = createTool({
  id: 'telegram-search',
  description: 'Search Telegram contacts by name, username, or phone number. Returns matching contacts with their names and usernames.',
  inputSchema: z.object({
    query: z.string().describe('Name, username, or phone number to search for'),
    limit: z.number().default(10).describe('Maximum number of results'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    contacts: z.array(z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string().optional(),
      username: z.string().optional(),
      phone: z.string().optional(),
    })),
    count: z.number(),
    error: z.string().optional(),
  }),
  execute: async ({ query, limit }) => {
    try {
      const tg = await getTg();
      const contacts = await tg.searchContacts(query, limit);
      return { success: true, contacts, count: contacts.length };
    } catch (err) {
      return { success: false, contacts: [], count: 0, error: errMsg(err) };
    }
  },
});

export const telegramGetRecentTool = createTool({
  id: 'telegram-get-recent',
  description: 'Get the most recent messages from all Telegram chats. Returns the latest message from each chat, sorted by date.',
  inputSchema: z.object({
    limit: z.number().default(10).describe('Maximum number of messages to return'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messages: z.array(z.object({
      id: z.number(),
      chatId: z.string(),
      chatName: z.string(),
      from: z.string(),
      text: z.string(),
      date: z.number(),
      unread: z.boolean(),
    })),
    count: z.number(),
    error: z.string().optional(),
  }),
  execute: async ({ limit }) => {
    try {
      const tg = await getTg();
      const messages = await tg.getRecentMessages(limit);
      return { success: true, messages, count: messages.length };
    } catch (err) {
      return { success: false, messages: [], count: 0, error: errMsg(err) };
    }
  },
});

export const telegramGetUnreadTool = createTool({
  id: 'telegram-get-unread',
  description: 'Get unread messages from all Telegram chats. Returns unread messages sorted by date.',
  inputSchema: z.object({
    limit: z.number().default(10).describe('Maximum number of unread messages to return'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messages: z.array(z.object({
      id: z.number(),
      chatId: z.string(),
      chatName: z.string(),
      from: z.string(),
      text: z.string(),
      date: z.number(),
    })),
    count: z.number(),
    error: z.string().optional(),
  }),
  execute: async ({ limit }) => {
    try {
      const tg = await getTg();
      const messages = await tg.getUnreadMessages(limit);
      return { success: true, messages, count: messages.length };
    } catch (err) {
      return { success: false, messages: [], count: 0, error: errMsg(err) };
    }
  },
});
