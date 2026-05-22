/**
 * auth-store.mjs — Encrypted credentials store for all connected services.
 *
 * Stores credentials in ~/.config/ufi/credentials.json with 600 permissions.
 * Loads them into process.env automatically.
 *
 * Encryption uses a randomly-generated master key stored at ~/.config/ufi/master.key
 * with 600 permissions, replacing the old machine-id-derived key.
 * Old credentials encrypted with machine-id key are still readable during migration.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

const CONFIG_DIR = join(homedir(), '.config', 'ufi');
const STORE_PATH = join(CONFIG_DIR, 'credentials.json');
const MASTER_KEY_PATH = join(CONFIG_DIR, 'master.key');

// -- Encryption key management --

export function initMasterKey() {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!existsSync(MASTER_KEY_PATH)) {
      const key = randomBytes(32).toString('hex');
      writeFileSync(MASTER_KEY_PATH, key, 'utf-8');
      chmodSync(MASTER_KEY_PATH, 0o600);
      console.log('[AuthStore] Generated new master key at', MASTER_KEY_PATH);
    }
  } catch (err) {
    console.error('[AuthStore] Failed to init master key:', err.message);
  }
}

function getEncryptionKey() {
  try {
    if (!existsSync(MASTER_KEY_PATH)) {
      throw new Error('Master key not found at ' + MASTER_KEY_PATH);
    }
    return readFileSync(MASTER_KEY_PATH, 'utf-8').trim();
  } catch (err) {
    console.error('[AuthStore] Cannot read master key:', err.message);
    throw err;
  }
}

// Old machine-id key derivation — for migration only
let _oldMachineKey = null;
function getOldMachineKey() {
  if (_oldMachineKey) return _oldMachineKey;
  let seed = 'ufi-default-key';
  try {
    if (existsSync('/etc/machine-id')) {
      seed = readFileSync('/etc/machine-id', 'utf-8').trim();
    } else if (existsSync('/var/lib/dbus/machine-id')) {
      seed = readFileSync('/var/lib/dbus/machine-id', 'utf-8').trim();
    }
  } catch {}
  _oldMachineKey = scryptSync(seed, 'ufi-salt', 32).toString('hex');
  return _oldMachineKey;
}

function encrypt(text) {
  const key = Buffer.from(getEncryptionKey(), 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const [ivHex, encryptedHex] = text.split(':');

  // Try with new key first
  try {
    const key = Buffer.from(getEncryptionKey(), 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf-8');
  } catch {
    // Fallback: try old machine-id key (for migration)
    try {
      const key = Buffer.from(getOldMachineKey(), 'hex');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf-8');
    } catch {
      throw new Error('Decryption failed with both keys');
    }
  }
}

// -- Public API --

const DEFAULT_SERVICES = {
  gemini: {
    name: 'Gemini AI',
    icon: '',
    description: 'Google Gemini API key',
    fields: [{ key: 'GEMINI_API_KEY', label: 'API Key', placeholder: 'AIza...' }],
    authType: 'key',
    connected: false,
    credentials: {},
    updatedAt: null,
  },
  opencode: {
    name: 'OpenCode',
    icon: '',
    description: 'AI coding assistant key',
    fields: [{ key: 'OPENCODE_API_KEY', label: 'API Key', placeholder: 'sk-...' }],
    authType: 'key',
    connected: false,
    credentials: {},
    updatedAt: null,
  },
  telegram: {
    name: 'Telegram',
    icon: '',
    description: 'Messaging API credentials',
    fields: [
      { key: 'TELEGRAM_API_ID', label: 'API ID', placeholder: '37225538' },
      { key: 'TELEGRAM_API_HASH', label: 'API Hash', placeholder: 'b28e5cb...' },
    ],
    authType: 'key',
    connected: false,
    credentials: {},
    updatedAt: null,
  },
};

// Map each service to the env vars that indicate it's configured
const SERVICE_ENV_KEYS = {
  gemini: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  opencode: ['OPENCODE_API_KEY'],
  telegram: ['TELEGRAM_API_ID'],
};

function loadStore() {
  if (!existsSync(STORE_PATH)) {
    return { services: { ...DEFAULT_SERVICES } };
  }
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    // Merge with defaults to add any new services
    for (const [id, svc] of Object.entries(DEFAULT_SERVICES)) {
      if (!data.services[id]) {
        data.services[id] = svc;
      }
    }
    // Remove services that are no longer in DEFAULT_SERVICES
    for (const id of Object.keys(data.services)) {
      if (!DEFAULT_SERVICES[id]) {
        delete data.services[id];
      }
    }
    return data;
  } catch {
    return { services: { ...DEFAULT_SERVICES } };
  }
}

function saveStore(data) {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    chmodSync(STORE_PATH, 0o600);
  } catch (err) {
    console.error('[AuthStore] Failed to save:', err.message);
  }
}

export function getServices() {
  const store = loadStore();
  const services = {};
  for (const [id, svc] of Object.entries(store.services)) {
    // Check if service is connected via credentials.json
    let connected = svc.connected;

    // Fallback: check process.env for required keys
    if (!connected) {
      const envKeys = SERVICE_ENV_KEYS[id] || [];
      connected = envKeys.some(key => process.env[key] && process.env[key].length > 0);
    }

    services[id] = {
      name: svc.name,
      icon: svc.icon,
      description: svc.description,
      authType: svc.authType,
      fields: svc.fields ? svc.fields.map(f => ({ key: f.key, label: f.label, placeholder: f.placeholder })) : [],
      connected,
      updatedAt: svc.updatedAt,
    };
  }
  return services;
}

export function isServiceConnected(serviceId) {
  const store = loadStore();
  return !!store.services[serviceId]?.connected;
}

export function getServiceCredentials(serviceId) {
  const store = loadStore();
  const svc = store.services[serviceId];
  if (!svc || !svc.connected) return {};
  const decrypted = {};
  for (const [key, value] of Object.entries(svc.credentials)) {
    try {
      decrypted[key] = decrypt(value);
    } catch {
      decrypted[key] = value;
    }
  }
  return decrypted;
}

export function setServiceCredentials(serviceId, credentials) {
  const store = loadStore();
  if (!store.services[serviceId]) {
    store.services[serviceId] = { ...DEFAULT_SERVICES[serviceId] };
  }
  const encrypted = {};
  for (const [key, value] of Object.entries(credentials)) {
    encrypted[key] = encrypt(String(value));
  }
  store.services[serviceId].credentials = encrypted;
  store.services[serviceId].connected = true;
  store.services[serviceId].updatedAt = new Date().toISOString();
  saveStore(store);

  // Also set in process.env for immediate use
  for (const [key, value] of Object.entries(credentials)) {
    process.env[key] = String(value);
  }
}

export function disconnectService(serviceId) {
  const store = loadStore();
  if (!store.services[serviceId]) return;
  const svc = store.services[serviceId];

  // Remove from process.env
  for (const key of Object.keys(svc.credentials)) {
    try {
      const plainKey = decrypt(key);
      delete process.env[plainKey];
    } catch {
      delete process.env[key];
    }
  }

  svc.credentials = {};
  svc.connected = false;
  svc.updatedAt = new Date().toISOString();
  saveStore(store);
}

export function loadCredentialsIntoEnv() {
  initMasterKey();
  const store = loadStore();
  for (const [serviceId, svc] of Object.entries(store.services)) {
    if (!svc.connected) continue;
    for (const [key, encryptedValue] of Object.entries(svc.credentials)) {
      try {
        const decrypted = decrypt(encryptedValue);
        process.env[key] = decrypted;
      } catch {
        // If decryption fails, use as-is (for backward compat)
        process.env[key] = encryptedValue;
      }
    }
  }
}
