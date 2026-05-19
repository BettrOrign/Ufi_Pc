#!/usr/bin/env node

/**
 * Telegram Login Script (one-time setup)
 * 
 * Run this ONCE to authenticate with Telegram:
 *   node src/telegram-login.mjs
 * 
 * You'll need:
 * 1. TELEGRAM_API_ID and TELEGRAM_API_HASH in .env (from https://my.telegram.org/apps)
 * 2. Your phone number
 * 3. The verification code sent to Telegram
 * 4. Your 2FA password (if enabled)
 * 
 * The session is saved to .telegram-session (or TELEGRAM_SESSION_PATH env var).
 * After this, telegram-client.mjs can use the saved session.
 */

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createClient, saveSessionFile, disconnect } from './telegram-client.mjs';
import { readFileSync, existsSync } from 'node:fs';

// Load .env file if it exists
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8');
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

async function main() {
  console.log('\n=== Telegram Login ===\n');
  console.log('Make sure TELEGRAM_API_ID and TELEGRAM_API_HASH are set in .env');
  console.log('Get them at https://my.telegram.org/apps\n');

  const rl = readline.createInterface({ input, output });

  try {
    const phoneNumber = await rl.question('Phone number (international format, e.g. +1234567890): ');
    const phone = phoneNumber.trim();

    if (!phone) {
      console.error('Phone number required');
      process.exit(1);
    }

    console.log('\nConnecting to Telegram...');
    const client = createClient();
    await client.connect();
    console.log('Connected!');

    await client.start({
      phoneNumber: async () => phone,
      phoneCode: async () => {
        const code = await rl.question('Verification code (from Telegram): ');
        return code.trim();
      },
      password: async (hint) => {
        console.log(`2FA password required. Hint: ${hint || 'none'}`);
        const password = await rl.question('2FA password: ');
        return password.trim();
      },
      onError: (err) => {
        console.error('Login error:', err.message);
      },
    });

    // Save the session
    const sessionString = client.session.save();
    saveSessionFile(sessionString);

    // Verify by getting user info
    const me = await client.getMe();
    console.log(`\n✅ Login successful!`);
    console.log(`   User: ${me.firstName || ''} ${me.lastName || ''} (@${me.username || 'N/A'})`);
    console.log(`   Session saved successfully.`);

    await client.disconnect();
  } catch (err) {
    console.error('\n❌ Login failed:', err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
