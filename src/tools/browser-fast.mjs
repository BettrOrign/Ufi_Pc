#!/usr/bin/env node

import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

function resolveChromium() {
  const envPath = process.env.CHROMIUM_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  const candidates = [
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium', '/snap/bin/chromium-browser',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return '/usr/bin/chromium';
}

const CHROMIUM_PATH = resolveChromium();
const STATE_FILE = '/tmp/ufi-fast-browser.json';
const MAX_TABS = 10;
const PAGE_TIMEOUT = 15000;

let browser = null;
let pages = [];
let browserPromise = null;

function closeOldestPage() {
  const oldest = pages.shift();
  if (oldest) {
    oldest.close().catch(() => {});
  }
}

async function acquirePage() {
  const br = await getBrowser();

  for (const pg of pages) {
    try {
      const url = await pg.url();
      if (url === 'about:blank') {
        await pg.bringToFront();
        return pg;
      }
    } catch {
      const idx = pages.indexOf(pg);
      if (idx >= 0) pages.splice(idx, 1);
    }
  }

  let safety = 0;
  while (pages.length >= MAX_TABS) {
    if (++safety > MAX_TABS + 5) break;
    closeOldestPage();
  }

  const pg = await br.newPage();
  pages.push(pg);
  await pg.bringToFront();
  return pg;
}

async function releasePage(pg) {
  try {
    await pg.goto('about:blank', { timeout: 5000 }).catch(() => {});
  } catch {}
}

async function getBrowser() {
  if (browserPromise) return browserPromise;

  browserPromise = (async () => {
    if (browser) {
      try {
        const pgs = await browser.pages().catch(() => null);
        if (pgs) return browser;
      } catch {}
      try { await browser.close().catch(() => {}); } catch {}
      browser = null;
      pages = [];
    }

    if (existsSync(STATE_FILE)) {
      try {
        const saved = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
        if (saved.wsEndpoint) {
          browser = await puppeteer.connect({
            browserWSEndpoint: saved.wsEndpoint,
            slowMo: 50,
          });
          pages = [];
          return browser;
        }
      } catch {
        try { unlinkSync(STATE_FILE); } catch {}
      }
    }

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

    try {
      writeFileSync(STATE_FILE, JSON.stringify({
        wsEndpoint: browser.wsEndpoint(),
        pid: browser.process()?.pid,
      }));
    } catch (e) {
      console.error('[Browser] Failed to save state file:', e.message);
    }

    pages = [];
    return browser;
  })().finally(() => {
    browserPromise = null;
  });

  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise) {
    await browserPromise.catch(() => {});
  }
  if (browser) {
    try {
      for (const pg of pages) {
        try { await pg.close(); } catch {}
      }
      await browser.close();
    } catch {}
    browser = null;
    pages = [];
  }
  try { unlinkSync(STATE_FILE); } catch {}
}

async function withBrowser(action) {
  let pg = null;
  let retried = false;
  while (true) {
    try {
      pg = await acquirePage();
      return await action(pg);
    } catch (err) {
      if (!retried && (
        err.message?.includes('Protocol') ||
        err.message?.includes('Target closed') ||
        err.message?.includes('Session closed') ||
        err.message?.includes('detached from') ||
        err.message?.includes('WebSocket')
      )) {
        console.error('[Browser] Browser died mid-action, restarting and retrying...');
        retried = true;
        pg = null;
        try { await closeBrowser(); } catch {}
        continue;
      }
      throw err;
    } finally {
      if (pg) {
        await releasePage(pg).catch(() => {});
      }
    }
  }
}

async function goto(url) {
  return withBrowser(async (pg) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
    await new Promise(r => setTimeout(r, 1500));
    const title = await pg.title();
    return { success: true, title, url: pg.url(), message: `Opened ${url}` };
  });
}

async function youtubeSearch(query) {
  return withBrowser(async (pg) => {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
    await pg.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });

    try {
      await pg.waitForSelector('a#video-title', { timeout: 8000 });
    } catch {
      // continue with what we have
    }

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

    if (results.length === 0) {
      return {
        success: true,
        results: [],
        count: 0,
        message: `Не найдено видео по запросу "${query}" (возможно, YouTube требует ручной проверки)`,
        url: searchUrl
      };
    }

    return {
      success: true,
      results,
      count: results.length,
      message: `Нашёл ${results.length} видео по запросу "${query}"`,
      url: searchUrl
    };
  });
}

async function youtubePlay(query) {
  return withBrowser(async (pg) => {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
    await pg.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });

    const videoSelector = 'a#video-title';
    try {
      await pg.waitForSelector(videoSelector, { timeout: 8000 });
      await pg.click(videoSelector);
      await new Promise(r => setTimeout(r, 2000));
      const title = await pg.title();
      const url = pg.url();
      return { success: true, title, url, message: `▶️ Воспроизводится: "${query}"` };
    } catch (err) {
      try {
        const altSelector = 'ytd-video-renderer a#video-title, ytd-video-renderer a.yt-simple-endpoint';
        await pg.waitForSelector(altSelector, { timeout: 5000 });
        await pg.click(altSelector);
        await new Promise(r => setTimeout(r, 2000));
        const title = await pg.title();
        const url = pg.url();
        return { success: true, title, url, message: `▶️ Воспроизводится: "${query}"` };
      } catch {
        return {
          success: false,
          message: `Не удалось открыть видео по запросу "${query}"`,
          url: searchUrl
        };
      }
    }
  });
}

async function search(query) {
  return withBrowser(async (pg) => {
    await pg.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT,
    });
    await new Promise(r => setTimeout(r, 1000));
    const title = await pg.title();
    const text = await pg.evaluate(() => document.body?.innerText?.slice(0, 2000) || '');
    return { success: true, title, url: pg.url(), message: `Searched for "${query}"`, text };
  });
}

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

  if (action === 'close') {
    process.exit(0);
  }
}

const isMain = process.argv[1]?.endsWith('browser-fast.mjs');
if (isMain && process.argv[2]) {
  main();
}

function getBrowserStatus() {
  return browser?.connected ? 'connected' : 'disconnected';
}

export { goto, youtubeSearch, youtubePlay, search, closeBrowser, getBrowser, getBrowserStatus };
