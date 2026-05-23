import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const STORE_PATH = join(process.cwd(), 'reminders.json');
const TEMP_PATH = STORE_PATH + '.tmp';
let writeQueue = Promise.resolve();

async function load() {
  if (!existsSync(STORE_PATH)) return { reminders: [] };
  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf-8'));
  } catch {
    return { reminders: [] };
  }
}

async function save(data) {
  await writeQueue;
  writeQueue = (async () => {
    await writeFile(TEMP_PATH, JSON.stringify(data, null, 2), 'utf-8');
    await rename(TEMP_PATH, STORE_PATH);
  })();
  return writeQueue;
}

export async function createReminder({ text, datetime }) {
  const store = await load();
  const reminder = {
    id: randomUUID(),
    text,
    datetime,
    createdAt: new Date().toISOString(),
    notified: false,
  };
  store.reminders.push(reminder);
  await save(store);
  return reminder;
}

export async function listReminders() {
  const store = await load();
  return store.reminders
    .filter(r => !r.notified)
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

export async function deleteReminder({ id, text } = {}) {
  const store = await load();
  if (id) {
    store.reminders = store.reminders.filter(r => r.id !== id);
  } else if (text) {
    const lower = text.toLowerCase();
    store.reminders = store.reminders.filter(r => !r.text.toLowerCase().includes(lower));
  }
  await save(store);
}

export async function getDueReminders() {
  const store = await load();
  const now = new Date();
  return store.reminders.filter(r => {
    if (r.notified) return false;
    return new Date(r.datetime) <= now;
  });
}

export async function markNotified(id) {
  const store = await load();
  const reminder = store.reminders.find(r => r.id === id);
  if (reminder) {
    reminder.notified = true;
    await save(store);
  }
}

export async function cleanupOld() {
  const store = await load();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  store.reminders = store.reminders.filter(r => {
    if (!r.notified) return true;
    return new Date(r.datetime) > cutoff;
  });
  await save(store);
}
