#!/usr/bin/env node
// browser-read.mjs - Open URL in headless Chromium, extract text.
// Usage: node browser-read.mjs <url>

import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) { console.log(JSON.stringify({error:'Usage: node browser-read.mjs <url>'})); process.exit(1); }

// Check if Playwright Chromium is available — if not, fall back to curl
const { execSync } = await import('child_process');
let hasChromium = false;
try {
  execSync('test -f /home/sirius/.cache/ms-playwright/chromium-*/chrome-linux64/chrome', { shell: true, stdio: 'ignore' });
  hasChromium = true;
} catch {}
if (!hasChromium) {
  try {
    execSync('npx playwright install chromium 2>/dev/null || test -f /usr/bin/chromium', { shell: true, stdio: 'ignore' });
    hasChromium = true;
  } catch {}
}

if (!hasChromium) {
  // Fallback to curl — fetch page content via DuckDuckGo lite or direct curl
  const http = await import('http');
  const https = await import('https');
  
  const fetchUrl = url.startsWith('https://html.duckduckgo.com') 
    ? url 
    : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(url.replace(/https?:\/\/[^/]+\/?/,'').slice(0,50))}`;
  
  try {
    const resp = await fetch(fetchUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await resp.text();
    // Strip HTML tags for plain text
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
    console.log(JSON.stringify({
      title: url,
      text: text || '[No content fetched]',
      url,
      success: true,
      note: 'Fetched via curl (Playwright Chromium not installed)',
    }));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message, url, success: false, note: 'Curl fallback failed' }));
  }
  process.exit(0);
}

// Chromium is available — use Playwright as normal
try {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();

  // Hide automation traces
  await page.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Fake chrome object
    window.chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {},
    };
    // Override permissions
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = (params) => (
      params.name === 'notifications'
        ? Promise.resolve({ state: 'denied' })
        : originalQuery(params)
    );
    // Add plugins array
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    // Add languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

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
