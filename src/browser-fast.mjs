#!/usr/bin/env node

/**
 * browser-fast.mjs — Lightweight browser control for the fast path.
 * Connects to a persistent Chrome instance and executes simple commands.
 * Used by the Intent Router to avoid LLM overhead for common tasks.
 */

import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const CHROMIUM_PATH = '/usr/bin/chromium';
const STATE_FILE = '/tmp/ufi-fast-browser.json';

let browser = null;
let page = null;

async function getBrowser() {
  // Try to reconnect to existing instance
  if (browser?.connected) {
    try {
      if (page && !page.isClosed()) {
        await page.evaluate(() => document.location.href);
        return { browser, page };
      }
    } catch {
      // Dead, will relaunch
    }
  }

  // Try reconnecting from saved state
  if (existsSync(STATE_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
      if (saved.wsEndpoint) {
        browser = await puppeteer.connect({ browserWSEndpoint: saved.wsEndpoint });
        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();
        return { browser, page };
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

  const pages = await browser.pages();
  page = pages[0] || await browser.newPage();
  return { browser, page };
}

async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
    page = null;
  }
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
}

// ─── Actions ───────────────────────────────────────────────

async function goto(url) {
  const { page } = await getBrowser();
  // Add https:// if no protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500)); // settle
  const title = await page.title();
  return { success: true, title, url: page.url(), message: `Opened ${url}` };
}

async function youtubeSearch(query) {
  const { page } = await getBrowser();
  
  // Go DIRECTLY to YouTube search results page (fastest path)
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  
  // Wait for video results to load
  await new Promise(r => setTimeout(r, 3000));

  // Click the first video result (video title link)
  const videoSelector = 'a#video-title';
  try {
    await page.waitForSelector(videoSelector, { timeout: 5000 });
    await page.click(videoSelector);
    // Wait for video page to load
    await new Promise(r => setTimeout(r, 2000));
    
    const title = await page.title();
    const url = page.url();
    return { success: true, title, url, message: `🎵 Воспроизводится: "${query}" на YouTube` };
  } catch (err) {
    // If can't click directly, try alternative selectors
    try {
      const altSelector = 'ytd-video-renderer a#video-title, ytd-video-renderer a.yt-simple-endpoint';
      await page.waitForSelector(altSelector, { timeout: 3000 });
      await page.click(altSelector);
      await new Promise(r => setTimeout(r, 2000));
      const title = await page.title();
      const url = page.url();
      return { success: true, title, url, message: `🎵 Воспроизводится: "${query}" на YouTube` };
    } catch (err2) {
      return { success: true, message: `Нашёл результаты для "${query}" на YouTube, но не смог автоматически открыть видео`, url: `${searchUrl}&hl=en` };
    }
  }
}

async function search(query) {
  const { page } = await getBrowser();
  await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await new Promise(r => setTimeout(r, 1000));
  const title = await page.title();
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || '');
  return { success: true, title, url: page.url(), message: `Searched for "${query}"`, text };
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

  // Don't exit — keep browser alive for next call
  if (action !== 'close') {
    // Keep process alive but don't exit
  } else {
    process.exit(0);
  }
}

// If called directly as a script
const isMain = process.argv[1]?.endsWith('browser-fast.mjs');
if (isMain && process.argv[2]) {
  main();
}

export { goto, youtubeSearch, search, closeBrowser, getBrowser };
