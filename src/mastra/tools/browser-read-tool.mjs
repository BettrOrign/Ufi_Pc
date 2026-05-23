import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

function stripHtml(html) {
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
      const { acquirePage, releasePage } = await import('../../tools/browser-fast.mjs');
      const pg = await acquirePage();
      try {
        const safeUrl = url.replace(/"/g, '');
        await pg.goto(safeUrl, { waitUntil: 'networkidle0', timeout: 15000 });
        const pageContent = await pg.evaluate(() => document.documentElement?.outerHTML || '');
        const content = stripHtml(pageContent);
        const lines = content.split('\n');
        const title = lines[0]?.length < 200 ? lines[0] : await pg.title();
        return { title, content, url, charCount: content.length };
      } finally {
        await releasePage(pg);
      }
    } catch (err) {
      throw new Error(`Failed to read page: ${err.message}`);
    }
  },
});
