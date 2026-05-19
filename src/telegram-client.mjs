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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Find the project root directory by looking for .env file.
 * Checks multiple candidate paths because __dirname changes when compiled by Mastra:
 * - Source: __dirname = src/ → ../.env = project root ✅
 * - Compiled: __dirname = .mastra/output/ → ../.env = .mastra/ ❌
 * So we try multiple locations.
 */
function findProjectRoot() {
  // Order of preference: direct candidates first, then try going up
  const candidates = [
    process.cwd(),                               // Running from project root (dev/build)
    path.resolve(__dirname, '..'),               // Source: src/ → project root ✅; Compiled: .mastra/output/ → .mastra/ ❌
    path.resolve(__dirname, '..', '..'),         // Compiled: .mastra/output/../.. → project root ✅
    __dirname,                                   // Direct fallback
  ];

  for (const dir of candidates) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      return dir;
    }
  }

  // Last resort: use process.cwd()
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

// Load .env from project root into process.env (Mastra/serve-ui may not do this automatically)
const __envPath = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(__envPath)) {
  const envContent = fs.readFileSync(__envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

// Log where we found the project root (for debugging)
if (PROJECT_ROOT !== process.cwd()) {
  console.log(`[Telegram] Project root: ${PROJECT_ROOT} (cwd: ${process.cwd()})`);
}

const SESSION_FILE = process.env.TELEGRAM_SESSION_PATH
  || path.join(PROJECT_ROOT, '.telegram-session');

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

  const { apiId, apiHash } = getApiCredentials();
  const sessionString = process.env.TELEGRAM_SESSION || loadSessionFile();

  if (!sessionString) {
    throw new Error(
      'No Telegram session found. Run `node src/telegram-login.mjs` to authenticate.'
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

  // Log disconnect events
  client.on('disconnect', () => {
    console.warn('[Telegram] Client disconnected');
    isReady = false;
  });
  client.on('error', (err) => {
    console.error('[Telegram] Client error:', err.message);
  });

  // Verify session is valid
  try {
    await client.getMe();
  } catch (err) {
    await client.disconnect();
    clientInstance = null;
    throw new Error(
      'Telegram session expired or invalid. Run `node src/telegram-login.mjs` again.\n' +
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
 * Search Telegram contacts by name, username, or phone.
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
      // Skip if it's the current user
      if (u.isSelf) return;
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
 * Check if a valid session exists.
 */
function hasSession() {
  const sessionString = process.env.TELEGRAM_SESSION || loadSessionFile();
  return !!sessionString;
}

export {
  createClient,
  disconnect,
  getClient,
  hasSession,
  saveSessionFile,
  searchContacts,
  sendToChat,
  sendToContactByName,
  sendToSavedMessages,
};
