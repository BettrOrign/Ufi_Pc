#!/usr/bin/env node
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdtempSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { tmpdir } from 'node:os';

const STATE_FILE = '/tmp/ufi-browser-state.json';
const CDP_TIMEOUT = 10000;

function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch {}
  }
  return {};
}

function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s));
}

const action = process.argv[2];

function extractWsEndpoint(stderr) {
  const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
  return match ? match[1] : null;
}

async function launchBrowser() {
  const userDataDir = mkdtempSync(tmpdir() + '/ufi-browser-');
  return new Promise((resolve, reject) => {
    const proc = spawn('/usr/bin/chromium', [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
    ], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Timed out waiting for CDP endpoint'));
    }, CDP_TIMEOUT);

    const onData = (data) => {
      stderr += data.toString();
      const ws = extractWsEndpoint(stderr);
      if (ws) {
        clearTimeout(timeout);
        proc.stderr.removeListener('data', onData);
        proc.unref();
        resolve({ wsEndpoint: ws, pid: proc.pid, userDataDir });
      }
    };

    proc.stderr.on('data', onData);
    proc.on('error', (err) => { clearTimeout(timeout); reject(err); });
    proc.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Chromium exited with code ${code} before providing CDP endpoint`)); });
  });
}

async function main() {
  if (!action) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node browser-control.mjs <open|click|type|scroll|extract|wait|close> [args...]' }));
    process.exit(1);
  }

  if (action === 'open') {
    const url = process.argv[3];
    if (!url) {
      console.log(JSON.stringify({ success: false, error: 'Missing URL' }));
      process.exit(1);
    }

    let launcher;
    try {
      launcher = await launchBrowser();
    } catch (e) {
      console.log(JSON.stringify({ success: false, error: 'Failed to launch Chromium: ' + e.message }));
      process.exit(1);
    }

    saveState({ wsEndpoint: launcher.wsEndpoint, pid: launcher.pid, userDataDir: launcher.userDataDir });

    let browser;
    try {
      browser = await chromium.connectOverCDP(launcher.wsEndpoint);
    } catch (e) {
      console.log(JSON.stringify({ success: false, error: 'Failed to connect to browser: ' + e.message }));
      process.exit(1);
    }

    // Use existing page if available, otherwise create new
    const existing = browser.contexts().flatMap(c => c.pages()).find(p => {
      try { const u = p.url(); return u && !u.startsWith('chrome://') && !u.startsWith('about:'); } catch { return false; }
    });
    const page = existing || await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      console.log('[BC] Page load warning:', e.message);
    }
    const title = await page.title();
    const text = await page.innerText('body');

    // Save last URL so reconnection can find/restore the page
    const st = loadState();
    st.lastUrl = url;
    saveState(st);

    console.log(JSON.stringify({ success: true, title, text: text.slice(0, 6000) }));
    process.exit(0);
  }

  const state = loadState();
  if (!state.wsEndpoint) {
    console.log(JSON.stringify({ success: false, error: 'No active browser. Call "open" first.' }));
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.connectOverCDP(state.wsEndpoint);
  } catch (e) {
    if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    console.log(JSON.stringify({ success: false, error: 'Browser disconnected. Call "open" again.' }));
    process.exit(1);
  }

  // Find the page with actual content (skip blank tabs and chrome:// pages)
  // Find existing page with real content
  const allPages = browser.contexts().flatMap(ctx => ctx.pages());
  let page = allPages.find(p => {
    try {
      const u = p.url();
      return u && !u.startsWith('chrome://') && !u.startsWith('about:') && !u.startsWith('devtools:');
    } catch { return false; }
  }) || null;

  if (!page) {
    // No real page found — restore from lastUrl or create blank
    const context = browser.contexts()[0];
    if (context) {
      page = allPages[0] || await context.newPage();
      // If we have a last URL, navigate there
      const st2 = loadState();
      if (st2.lastUrl && page.url().startsWith('chrome://')) {
        try { await page.goto(st2.lastUrl, { timeout: 15000 }); } catch {}
      }
    } else {
      console.log(JSON.stringify({ success: false, error: 'No browser context available' }));
      await browser.close();
      process.exit(1);
    }
  }

  let result;

  try {
    switch (action) {
      case 'click': {
        const selector = process.argv[3];
        if (!selector) throw new Error('Missing selector. Use: text=Name, #id, .class, [attr=value]');
        await page.waitForSelector(selector, { timeout: 7000 });
        await page.click(selector);
        await page.waitForTimeout(500);
        const title = await page.title();
        const text = await page.innerText('body');
        result = { success: true, title, text: text.slice(0, 6000) };
        break;
      }

      case 'type': {
        const selector = process.argv[3];
        const text = process.argv.slice(4).join(' ');
        if (!selector) throw new Error('Missing selector');
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.fill(selector, '');
        await page.type(selector, text, { delay: 30 });
        await page.waitForTimeout(300);
        result = { success: true, message: 'Typed: ' + text };
        break;
      }

      case 'scroll': {
        const dir = process.argv[3] || 'down';
        const amount = parseInt(process.argv[4]) || 400;
        const delta = dir === 'up' ? -amount : amount;
        await page.evaluate((d) => window.scrollBy(0, d), delta);
        await page.waitForTimeout(600);
        const text = await page.innerText('body');
        result = { success: true, direction: dir, pixels: delta, text: text.slice(0, 6000) };
        break;
      }

      case 'extract': {
        const title = await page.title();
        const url = page.url();
        const text = await page.innerText('body');
        const links = await page.$$eval('a[href]', els =>
          els.map(a => ({ text: a.innerText?.trim()?.slice(0, 40), href: a.href }))
            .filter(l => l.text && l.href && !l.href.startsWith('javascript:'))
            .slice(0, 20)
        );
        result = { success: true, title, url, text: text.slice(0, 8000), links };
        break;
      }

      case 'wait': {
        const ms = parseInt(process.argv[3]) || 1000;
        await page.waitForTimeout(ms);
        result = { success: true, message: 'Waited ' + ms + 'ms' };
        break;
      }

      case 'close': {
        const st = loadState();
        await browser.close();
        if (st.pid) {
          try { process.kill(st.pid, 'SIGKILL'); } catch {}
        }
        if (st.userDataDir) {
          try { rmSync(st.userDataDir, { recursive: true, force: true }); } catch {}
        }
        if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
        result = { success: true, message: 'Browser closed' };
        break;
      }

      default:
        result = { success: false, error: 'Unknown action: ' + action + '. Use: open, click, type, scroll, extract, wait, close' };
    }
  } catch (e) {
    result = { success: false, error: e.message, action };
  }

  if (browser) browser.close();
  console.log(JSON.stringify(result));
  process.exit(0);
}

main().catch(err => {
  console.log(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
