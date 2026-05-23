import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const webSearchTool = createTool({
  id: 'web-search',
  description:
    'Search the web for current information. ' +
    'Use this for ANY question that needs up-to-date info, facts, news, or data from the internet. ' +
    'Returns search result snippets with titles and links. ' +
    'After searching, you can read specific pages with the browserRead tool.',
  inputSchema: z.object({
    query: z.string().describe('Search query (can be in any language)'),
    maxResults: z.number().default(8).describe('Maximum number of search results to return'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      snippet: z.string(),
      url: z.string(),
    })),
    resultCount: z.number(),
    error: z.string().optional(),
  }),
  execute: async ({ query, maxResults = 8 }) => {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        results: [],
        resultCount: 0,
        error: `Search engine returned status ${response.status}`,
      };
    }

    const html = await response.text();

    if (
      html.includes('captcha') ||
      html.toLowerCase().includes('blocked') ||
      html.includes('unusual traffic')
    ) {
      return {
        results: [],
        resultCount: 0,
        error: 'Search engine is blocking automated requests (captcha or rate limit detected)',
      };
    }

    const results = [];

    const blockPattern = /<div[^>]*class="[^"]*(?:result|results__item)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const blockMatches = [...html.matchAll(blockPattern)];
    for (const block of blockMatches) {
      if (results.length >= maxResults) break;
      const section = block[1];
      const links = [...section.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      if (links.length === 0) continue;
      const url = links[0][1];
      const title = links[0][2].replace(/<[^>]*>/g, '').trim();
      const snippetMatch = section.match(/class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      if (url && title && !url.includes('duckduckgo.com')) {
        results.push({ title, snippet, url });
      }
    }

    if (results.length === 0) {
      const linkPattern = /<a[^>]*href="(https?:\/\/(?!duckduckgo\.com)[^"]+)"[^>]*class="[^"]*(?:result__a|result__title)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetPattern = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      const rawLinks = [];
      const rawSnippets = [];

      let m;
      while ((m = linkPattern.exec(html)) !== null) {
        rawLinks.push({ url: m[1], title: m[2].replace(/<[^>]*>/g, '').trim() });
      }
      while ((m = snippetPattern.exec(html)) !== null) {
        rawSnippets.push(m[1].replace(/<[^>]*>/g, '').trim());
      }
      for (let i = 0; i < Math.min(rawLinks.length, maxResults); i++) {
        const snippet = rawSnippets[i] || rawLinks[i].title.slice(0, 80);
        results.push({ title: rawLinks[i].title, snippet, url: rawLinks[i].url });
      }
    }

    if (results.length === 0) {
      const allLinks = [...html.matchAll(/<a[^>]*href="(https?:\/\/(?!duckduckgo\.com)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      const seen = new Set();
      for (const link of allLinks) {
        if (results.length >= maxResults) break;
        const url = link[1];
        if (seen.has(url)) continue;
        seen.add(url);
        const title = link[2].replace(/<[^>]*>/g, '').trim();
        if (url && title && title.length > 3) {
          results.push({ title, snippet: '', url });
        }
      }
    }

    if (results.length === 0) {
      console.warn(`[WebSearch] 0 results for "${query}" — all 3 parsing strategies failed`);
    }

    return {
      results,
      resultCount: results.length,
    };
  },
});
