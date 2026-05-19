import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spawn } from 'node:child_process';

const CHROMIUM_BINARY = '/usr/bin/chromium';

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/&#[0-9]+;/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .trim();
}

function fetchPageAsync(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const safeUrl = url.replace(/"/g, '');
    const child = spawn(CHROMIUM_BINARY, [
      '--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
      '--dump-dom', '--virtual-time-budget=8000', safeUrl
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Browser read timed out after 15s'));
    }, 15000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Chromium exited with code ${code}: ${stderr.slice(0, 200)}`));
      } else {
        try {
          resolve(stripHtml(stdout));
        } catch (err) {
          reject(err);
        }
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export const browserReadTool = createTool({
  id: 'browser-read',
  description: 'Open a URL in headless Chromium and return the readable text content of the page. Use this for web pages that require JavaScript rendering (SPAs, dynamic content) or when you need the full content of a page for analysis.',
  inputSchema: z.object({
    url: z.string().url().describe('The full URL to open and read (e.g. https://example.com/page)'),
  }),
  outputSchema: z.object({
    title: z.string().optional(),
    content: z.string(),
    url: z.string(),
    charCount: z.number(),
  }),
  execute: async ({ url }) => {
    try {
      const content = await fetchPageAsync(url);
      const lines = content.split('\n');
      const title = lines[0]?.length < 200 ? lines[0] : undefined;
      return { title, content, url, charCount: content.length };
    } catch (err) {
      throw new Error(`Failed to read page: ${(err as Error).message}`);
    }
  },
});
