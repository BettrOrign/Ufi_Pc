#!/usr/bin/env node

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createClient, saveSessionFile, disconnect } from '../tools/telegram-client.mjs';
import 'dotenv/config';

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

    const sessionString = client.session.save();
    saveSessionFile(sessionString);

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
