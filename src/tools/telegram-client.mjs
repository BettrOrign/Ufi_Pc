/**
 * Telegram MTProto client module (GramJS)
 * 
 * Connects to Telegram's MTProto API as a user (not a bot).
 * Uses the `telegram` npm package (GramJS).
 * 
 * Environment variables:
 *   TELEGRAM_API_ID     - Required. API ID from https://my.telegram.org/apps
 *   TELEGRAM_API_HASH   - Required. API Hash from https://my.telegram.org/apps
 *   TELEGRAM_SESSION    - Optional. Session string (overrides file)
 *   TELEGRAM_SESSION_PATH - Optional. Path to session file (default: .telegram-session)
 */

import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import fs from 'node:fs';
import path from 'node:path';

const debug = process.env.DEBUG ? console.log : () => {};

const SESSION_FILE = process.env.TELEGRAM_SESSION_PATH || path.join(process.cwd(), '.telegram-session');

let clientInstance = null;
let isReady = false;

function getApiCredentials() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) {
    throw new Error(
      'TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in .env\n' +
      'Get them from https://my.telegram.org/apps'
    );
  }
  return { apiId, apiHash };
}

function loadSessionFile() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      return fs.readFileSync(SESSION_FILE, 'utf-8').trim();
    }
  } catch (err) {
    console.error('Failed to load Telegram session file:', err.message);
  }
  return '';
}

function saveSessionFile(sessionString) {
  try {
    fs.writeFileSync(SESSION_FILE, sessionString, 'utf-8');
    console.log('Telegram session saved to', SESSION_FILE);
  } catch (err) {
    console.error('Failed to save Telegram session:', err.message);
  }
}

/**
 * Get or create the singleton TelegramClient with saved session.
 * Throws if no session exists (user needs to run telegram-login.mjs first).
 */
async function getClient() {
  if (clientInstance && isReady) return clientInstance;

  if (clientInstance) {
    try {
      await clientInstance.disconnect().catch(() => {});
    } catch {}
    clientInstance = null;
    isReady = false;
  }

  const { apiId, apiHash } = getApiCredentials();
  const sessionString = process.env.TELEGRAM_SESSION || loadSessionFile();

  if (!sessionString) {
    throw new Error(
      'No Telegram session found. Run `node src/auth/telegram-login.mjs` to authenticate.'
    );
  }

  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: Infinity,
    retryDelay: 1000,
    timeout: 15,
    autoReconnect: true,
    requestRetries: 3,
    floodSleepThreshold: 60,
  });

  await client.connect();

  client.on('disconnect', () => {
    console.warn('[Telegram] Client disconnected');
    isReady = false;
  });
  client.on('error', (err) => {
    console.error('[Telegram] Client error:', err.message);
  });

  try {
    await client.getMe();
  } catch (err) {
    await client.disconnect();
    clientInstance = null;
    throw new Error(
      'Telegram session expired or invalid. Run `node src/auth/telegram-login.mjs` again.\n' +
      'Error: ' + err.message
    );
  }

  clientInstance = client;
  isReady = true;
  return client;
}

/**
 * Send a message to Saved Messages ("Избранные").
 */
async function sendToSavedMessages(text) {
  const client = await getClient();
  const result = await client.sendMessage('me', {
    message: String(text),
  });
  return { success: true, messageId: result.id };
}

/**
 * Send a message to a specific chat.
 * @param {string} chatIdentifier - Chat username, phone number, or 'me'/'saved'/'избранные' for Saved Messages
 * @param {string} text - Message text
 */
async function sendToChat(chatIdentifier, text) {
  const client = await getClient();

  // Normalize Saved Messages identifiers
  const target = (chatIdentifier === 'me' || chatIdentifier === 'saved' || chatIdentifier === 'избранные')
    ? 'me'
    : chatIdentifier;

  const result = await client.sendMessage(target, {
    message: String(text),
  });

  return { success: true, messageId: result.id };
}

/**
 * Search ONLY the user's Telegram contacts by name, username, or phone.
 * Does NOT search globally — only returns users from the contact list.
 * @param {string} query - Search query (name, username, or phone)
 * @param {number} limit - Max results (default 10)
 * @returns {Array} Array of { id, firstName, lastName, username, phone }
 */
async function searchContacts(query, limit = 10) {
  const client = await getClient();
  
  const result = await client.invoke(new Api.contacts.Search({
    q: String(query),
    limit,
  }));

  // Parse the result into clean objects
  const contacts = [];
  if (result.users && result.users.length > 0) {
    result.users.forEach(u => {
      // Skip if it's the current user or not in my contacts list
      if (u.isSelf) return;
      if (!u.contact) return; // Only show MY contacts, not global search results
      contacts.push({
        id: u.id?.toString(),
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        username: u.username || '',
        phone: u.phone || '',
      });
    });
  }

  return contacts;
}

/**
 * Find a contact by display name and send them a message.
 * Searches contacts, finds the best match, and sends the message.
 * @param {string} contactName - Name to search for (e.g., "кто то")
 * @param {string} text - Message text
 * @returns {Object} { success, messageId, contact }
 */
async function sendToContactByName(contactName, text) {
  // Defensive: if "избранные" passed as contact, redirect to saved messages
  const lower = contactName.toLowerCase();
  if (lower === 'me' || lower === 'saved' || lower === 'избранные') {
    return sendToSavedMessages(text);
  }
  
  const contacts = await searchContacts(contactName, 5);

  if (contacts.length === 0) {
    throw new Error(`Контакт "${contactName}" не найден`);
  }

  // Best match: exact firstName match, or first result
  const lowerQuery = contactName.toLowerCase();
  let match = contacts.find(c => 
    c.firstName?.toLowerCase() === lowerQuery || 
    c.lastName?.toLowerCase() === lowerQuery ||
    c.username?.toLowerCase() === lowerQuery ||
    `${c.firstName} ${c.lastName}`.toLowerCase() === lowerQuery
  );

  if (!match) {
    match = contacts[0];
  }

  const client = await getClient();
  const result = await client.sendMessage(match.id, {
    message: String(text),
  });

  return {
    success: true,
    messageId: result.id,
    contact: match,
  };
}

/**
 * Create an unauthenticated TelegramClient for the login flow.
 * Used by telegram-login.mjs.
 */
function createClient() {
  const { apiId, apiHash } = getApiCredentials();
  const session = new StringSession('');
  return new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    retryDelay: 1000,
    timeout: 15000,
    baseHash: { _: null },
  });
}

/**
 * Disconnect and reset the singleton.
 */
async function disconnect() {
  if (clientInstance) {
    try {
      await clientInstance.disconnect();
    } catch {}
    clientInstance = null;
    isReady = false;
  }
}

/**
 * Get the most recent messages across all Telegram chats.
 * Returns one latest message per chat, sorted by date descending.
 * @param {number} limit - Maximum messages to return (default 10)
 * @returns {Array} Array of { id, chatId, chatName, from, text, date, unread }
 */
export async function getRecentMessages(limit = 10) {
  const client = await getClient();

  const dialogs = await client.getDialogs({
    limit: Math.max(limit, 30),
  });

  const messages = [];

  for (const dialog of dialogs) {
    if (!dialog.lastMessage) continue;

    const msg = dialog.lastMessage;
    const chatName = dialog.name || dialog.title || 'Unknown';

    let from = 'Unknown';
    if (msg.sender) {
      const s = msg.sender;
      from = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.username || 'Unknown';
    }

    messages.push({
      id: msg.id,
      chatId: String(dialog.id || ''),
      chatName,
      from,
      text: msg.message || '(media/unsupported)',
      date: msg.date,
      unread: (dialog.unreadCount || 0) > 0,
    });
  }

  messages.sort((a, b) => b.date - a.date);
  return messages.slice(0, limit);
}

/**
 * Get unread messages from all Telegram chats.
 * @param {number} limit - Maximum messages to return (default 10)
 * @returns {Array} Array of { id, chatId, chatName, from, text, date }
 */
export async function getUnreadMessages(limit = 10) {
  const client = await getClient();

  const dialogs = await client.getDialogs({
    limit: 50,
  });

  const messages = [];

  for (const dialog of dialogs) {
    const unreadCount = dialog.unreadCount || 0;
    if (unreadCount === 0) continue;

    try {
      const history = await client.getMessages(dialog.id, {
        limit: Math.min(unreadCount, 5),
      });

      for (const msg of history) {
        const chatName = dialog.name || dialog.title || 'Unknown';

        let from = 'Unknown';
        if (msg.sender) {
          const s = msg.sender;
          from = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.username || 'Unknown';
        }

        messages.push({
          id: msg.id,
          chatId: String(dialog.id || ''),
          chatName,
          from,
          text: msg.message || '(media/unsupported)',
          date: msg.date,
        });
      }
    } catch (err) {
      console.error(`[Telegram] Failed to get messages from ${dialog.name}:`, err.message);
    }
  }

  messages.sort((a, b) => b.date - a.date);
  return messages.slice(0, limit);
}

/**
 * Check if a valid session exists.
 */
function hasSession() {
  const sessionString = process.env.TELEGRAM_SESSION || loadSessionFile();
  return !!sessionString;
}

/**
 * Safe connection status check — does NOT connect to Telegram servers.
 * Returns 'connected' if client is active, 'saved' if session exists but not connected, 'disconnected' otherwise.
 */
function getConnectionStatus() {
  if (clientInstance && isReady) {
    return 'connected';
  }
  if (hasSession()) {
    return 'saved';
  }
  return 'disconnected';
}

export {
  createClient,
  disconnect,
  getClient,
  getConnectionStatus,
  hasSession,
  saveSessionFile,
  searchContacts,
  sendToChat,
  sendToContactByName,
  sendToSavedMessages,
};
