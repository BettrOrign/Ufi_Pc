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
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      title: z.string(),
      snippet: z.string(),
      url: z.string(),
    })),
    resultCount: z.number(),
  }),
  execute: async ({ query }) => {
    // Use DuckDuckGo HTML search (scraped, no browser needed)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await response.text();

    // Parse search results from DuckDuckGo HTML
    const results: Array<{ title: string; snippet: string; url: string }> = [];

    // Match result blocks: <h2 class="result__title">...<a...>TITLE</a>...
    // Followed by <a class="result__snippet"...>SNIPPET</a>
    // And <a class="result__url"...>URL</a>

    const resultRegex = /<h2[^>]*class="result__title"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>.*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gs;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
      const url = match[1].trim();
      const title = match[2].replace(/<[^>]*>/g, '').trim();
      const snippet = match[3].replace(/<[^>]*>/g, '').trim();

      // Skip ads and non-http links
      if (url.startsWith('http') && title && snippet) {
        results.push({ title, snippet, url });
      }
    }

    // Fallback: try alternative parsing if regex didn't match
    if (results.length === 0) {
      // Simple fallback: extract any links with text
      const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gs;

      const links: string[] = [];
      const snippets: string[] = [];

      while ((match = linkRegex.exec(html)) !== null) {
        links.push(match[1]);
      }
      while ((match = snippetRegex.exec(html)) !== null) {
        snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
      }

      for (let i = 0; i < Math.min(links.length, snippets.length, 8); i++) {
        if (links[i].startsWith('http')) {
          results.push({
            title: snippets[i]?.slice(0, 80) || 'Result',
            snippet: snippets[i] || '',
            url: links[i],
          });
        }
      }
    }

    return {
      results,
      resultCount: results.length,
    };
  },
});
