/**
 * reminder-store.mjs — Simple JSON-file based reminder storage.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STORE_PATH = join(process.cwd(), 'reminders.json');

function load() {
  if (!existsSync(STORE_PATH)) return { reminders: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return { reminders: [] };
  }
}

function save(data) {
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

let idCounter = Date.now();

export function createReminder({ text, datetime }) {
  const store = load();
  const reminder = {
    id: String(++idCounter),
    text,
    datetime,
    createdAt: new Date().toISOString(),
    notified: false,
  };
  store.reminders.push(reminder);
  save(store);
  return reminder;
}

export function listReminders() {
  const store = load();
  // Return active (not yet notified) reminders, sorted by datetime
  const active = store.reminders
    .filter(r => !r.notified)
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  return active;
}

export function deleteReminder({ id, text } = {}) {
  const store = load();
  if (id) {
    store.reminders = store.reminders.filter(r => r.id !== id);
  } else if (text) {
    const lower = text.toLowerCase();
    store.reminders = store.reminders.filter(r => !r.text.toLowerCase().includes(lower));
  }
  save(store);
}

export function getDueReminders() {
  const store = load();
  const now = new Date();
  const due = store.reminders.filter(r => {
    if (r.notified) return false;
    const dt = new Date(r.datetime);
    return dt <= now;
  });
  return due;
}

export function markNotified(id) {
  const store = load();
  const reminder = store.reminders.find(r => r.id === id);
  if (reminder) {
    reminder.notified = true;
    save(store);
  }
}

export function cleanupOld() {
  const store = load();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7); // keep 7 days
  store.reminders = store.reminders.filter(r => {
    if (!r.notified) return true;
    return new Date(r.datetime) > cutoff;
  });
  save(store);
}
