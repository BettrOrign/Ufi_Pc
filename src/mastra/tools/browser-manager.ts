import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import type { Browser, Page } from 'puppeteer-core';

// Apply stealth plugin to avoid bot detection (YouTube, etc.)
puppeteer.use(StealthPlugin());

const STATE = '/tmp/ufi-browser.json';
const CHROMIUM_PATH = '/usr/bin/chromium';

let browserInstance: Browser | null = null;
let currentPage: Page | null = null;

export async function getOrLaunchBrowser(): Promise<{ browser: Browser; page: Page }> {
  // Reuse existing instance if still alive
  if (browserInstance?.connected && currentPage && !currentPage.isClosed()) {
    try {
      // Quick health check — navigate to actual URL to verify responsiveness
      const currentUrl = await currentPage.evaluate(() => document.location.href).catch(() => null);
      if (currentUrl !== null) {
        return { browser: browserInstance, page: currentPage };
      }
    } catch {
      // Page is dead, will reconnect or relaunch
    }
  }

  // Try to reconnect to saved CDP endpoint (for process restart recovery)
  if (existsSync(STATE)) {
    try {
      const saved = JSON.parse(readFileSync(STATE, 'utf-8'));
      if (saved.wsEndpoint) {
        browserInstance = await puppeteer.connect({
          browserWSEndpoint: saved.wsEndpoint,
          defaultViewport: { width: 1280, height: 800 },
        });
        const pages = await browserInstance.pages();
        // Use existing YouTube tab if available, otherwise create new
        currentPage = pages[0] || await browserInstance.newPage();
        return { browser: browserInstance, page: currentPage };
      }
    } catch {
      if (existsSync(STATE)) unlinkSync(STATE);
    }
  }

  // Launch new browser
  browserInstance = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1280, height: 800 },
  });

  // Save reconnect info
  writeFileSync(STATE, JSON.stringify({
    wsEndpoint: browserInstance.wsEndpoint(),
    pid: browserInstance.process()?.pid,
  }));

  const pages = await browserInstance.pages();
  currentPage = pages[0] || await browserInstance.newPage();

  return { browser: browserInstance, page: currentPage };
}

// Cleanup on process exit
process.on('exit', () => {
  if (browserInstance) {
    browserInstance.close().catch(() => {});
  }
});
