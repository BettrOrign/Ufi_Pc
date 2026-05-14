#!/usr/bin/env node
// browser-read.mjs - Open URL in headless Chromium, extract text.
// Usage: node browser-read.mjs <url>

import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) { console.log(JSON.stringify({error:'Usage: node browser-read.mjs <url>'})); process.exit(1); }

try {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

  const title = await page.title();
  const text = await page.innerText('body');
  const links = await page.$$eval('a[href]', els =>
    els.map(a => ({ text: a.innerText?.trim()?.slice(0,50), href: a.href }))
    .filter(l => l.text && l.href && !l.href.startsWith('javascript:'))
    .slice(0, 15)
  );

  await browser.close();

  const result = {
    title,
    text: text?.substring(0, 8000) || '[No text found]',
    links,
    url,
    success: true,
  };

  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: err.message, url, success: false }));
  process.exit(1);
}
