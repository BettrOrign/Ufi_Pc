import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const telegramSendTool = createTool({
  id: 'telegram-send',
  description: 'Send a message to a Telegram chat or contact. For "Saved Messages" use chat="me". For any contact, you can use their name (е.g. "Анвар"), username, or phone number.',
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
      // Normalize "Saved Messages" identifiers
      const isSaved = chat === 'me' || chat === 'saved' || chat === 'избранные';
      
      if (isSaved) {
        const { sendToSavedMessages } = await import('../../telegram-client.mjs');
        const r = await sendToSavedMessages(text);
        return { success: true, messageId: r.messageId };
      }

      // Try sending by contact name first (searches contacts for a match)
      const { sendToContactByName } = await import('../../telegram-client.mjs');
      const r = await sendToContactByName(chat, text);
      return { success: true, messageId: r.messageId, contact: r.contact };
    } catch (err) {
      // Fallback: try sending directly (chat might be a username or phone)
      try {
        const { sendToChat } = await import('../../telegram-client.mjs');
        const r = await sendToChat(chat, text);
        return { success: true, messageId: r.messageId };
      } catch (fallbackErr) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
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
      const { searchContacts } = await import('../../telegram-client.mjs');
      const contacts = await searchContacts(query, limit);
      return { success: true, contacts, count: contacts.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, contacts: [], count: 0, error: message };
    }
  },
});

export const telegramGetRecentTool = createTool({
  id: 'telegram-get-recent',
  description: 'Get the most recent messages from all Telegram chats. Returns the latest message from each chat, sorted by date. Use when the user says "покажи последние сообщения" or "show recent messages".',
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
      const { getRecentMessages } = await import('../../telegram-client.mjs');
      const messages = await getRecentMessages(limit);
      return { success: true, messages, count: messages.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, messages: [], count: 0, error: message };
    }
  },
});

export const telegramGetUnreadTool = createTool({
  id: 'telegram-get-unread',
  description: 'Get unread messages from all Telegram chats. Returns unread messages sorted by date. Use when the user says "покажи непрочитанные сообщения" or "show unread messages".',
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
      const { getUnreadMessages } = await import('../../telegram-client.mjs');
      const messages = await getUnreadMessages(limit);
      return { success: true, messages, count: messages.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, messages: [], count: 0, error: message };
    }
  },
});
