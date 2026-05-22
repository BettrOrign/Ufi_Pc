#!/usr/bin/env node

/**
 * browser-fast.mjs — Lightweight browser control for the fast path.
 * Every action opens a NEW browser tab. Tabs are not reused.
 */

import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const CHROMIUM_PATH = '/usr/bin/chromium';
const STATE_FILE = '/tmp/ufi-fast-browser.json';

let browser = null;
let _pages = [];  // Track all created pages for cleanup

async function getBrowser() {
  // Reconnect to existing instance
  if (browser?.connected) return browser;

  // Try reconnecting from saved state
  if (existsSync(STATE_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      if (saved.wsEndpoint) {
        browser = await puppeteer.connect({ browserWSEndpoint: saved.wsEndpoint });
        return browser;
      }
    } catch {
      if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    }
  }

  // Launch new browser
  browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800',
    ],
    defaultViewport: { width: 1280, height: 800 },
  });

  // Save reconnect info
  writeFileSync(STATE_FILE, JSON.stringify({
    wsEndpoint: browser.wsEndpoint(),
    pid: browser.process()?.pid,
  }));

  _pages = [];
  return browser;
}

async function newPage() {
  const br = await getBrowser();
  const pg = await br.newPage();
  _pages.push(pg);
  await pg.bringToFront();
  return pg;
}

async function closeBrowser() {
  if (browser) {
    try {
      // Close all tracked pages first
      for (const pg of _pages) {
        try { await pg.close(); } catch {}
      }
      await browser.close();
    } catch {}
    browser = null;
    _pages = [];
  }
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
}

// ─── Actions ───────────────────────────────────────────────

async function goto(url) {
  const pg = await newPage();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  const title = await pg.title();
  return { success: true, title, url: pg.url(), message: `Opened ${url}` };
}

async function youtubeSearch(query) {
  const pg = await newPage();
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
  await pg.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));

  const results = await pg.evaluate(() => {
    const items = [];
    const links = document.querySelectorAll('a#video-title');
    links.forEach((a, i) => {
      if (i < 10) {
        items.push({
          title: (a.title || a.textContent || '').trim(),
          url: a.href || '',
        });
      }
    });
    return items;
  });

  return {
    success: true,
    results,
    count: results.length,
    message: `Нашёл ${results.length} видео по запросу "${query}"`,
    url: searchUrl
  };
}

async function youtubePlay(query) {
  const pg = await newPage();
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
  await pg.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));

  const videoSelector = 'a#video-title';
  try {
    await pg.waitForSelector(videoSelector, { timeout: 5000 });
    await pg.click(videoSelector);
    await new Promise(r => setTimeout(r, 2000));
    const title = await pg.title();
    const url = pg.url();
    return { success: true, title, url, message: `▶️ Воспроизводится: "${query}"` };
  } catch (err) {
    try {
      const altSelector = 'ytd-video-renderer a#video-title, ytd-video-renderer a.yt-simple-endpoint';
      await pg.waitForSelector(altSelector, { timeout: 3000 });
      await pg.click(altSelector);
      await new Promise(r => setTimeout(r, 2000));
      const title = await pg.title();
      const url = pg.url();
      return { success: true, title, url, message: `▶️ Воспроизводится: "${query}"` };
    } catch (err2) {
      return { success: true, message: `Нашёл результаты для "${query}", но не смог открыть видео`, url: searchUrl };
    }
  }
}

async function search(query) {
  const pg = await newPage();
  await pg.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await new Promise(r => setTimeout(r, 1000));
  const title = await pg.title();
  const text = await pg.evaluate(() => document.body?.innerText?.slice(0, 2000) || '');
  return { success: true, title, url: pg.url(), message: `Searched for "${query}"`, text };
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const action = process.argv[2];
  const args = process.argv.slice(3);

  try {
    let result;
    switch (action) {
      case 'goto':
        result = await goto(args.join(' '));
        break;
      case 'youtube':
        result = await youtubePlay(args.join(' '));
        break;
      case 'youtube-search':
        result = await youtubeSearch(args.join(' '));
        break;
      case 'search':
        result = await search(args.join(' '));
        break;
      case 'close':
        await closeBrowser();
        result = { success: true, message: 'Browser closed' };
        break;
      default:
        result = { success: false, message: `Unknown action: ${action}` };
    }
    console.log(JSON.stringify(result));
  } catch (err) {
    console.log(JSON.stringify({ success: false, message: err.message }));
  }

  // Keep process alive for next call
  if (action !== 'close') {
    // Don't exit
  } else {
    process.exit(0);
  }
}

// If called directly as a script
const isMain = process.argv[1]?.endsWith('browser-fast.mjs');
if (isMain && process.argv[2]) {
  main();
}

// Safe status check — does NOT launch browser
function getBrowserStatus() {
  return browser?.connected ? 'connected' : 'disconnected';
}

export { goto, youtubeSearch, youtubePlay, search, closeBrowser, getBrowser, getBrowserStatus };
