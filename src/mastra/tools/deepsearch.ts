import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { oscar } from '../agents/oscar';

export const deepSearchTool = createTool({
  id: 'deep-search',
  description: 'Deep research on any topic. Searches multiple sources, reads full pages, and returns a structured report with facts, dates, sources, and analysis.',
  inputSchema: z.object({
    topic: z.string().describe('Topic to research in depth'),
  }),
  outputSchema: z.object({
    report: z.string(),
    sourceCount: z.number(),
  }),
  execute: async ({ topic }) => {
    const result = await oscar.generate(
      `Conduct deep research on: "${topic}"

1. Use webSearch to find information from multiple sources (Wikipedia, BBC, Reuters, news sites, etc.)
2. For the most important pages, use browserRead to get the full content
3. Collect: key facts, dates, people involved, evidence, controversies, recent developments
4. Return a well-structured report with all sources cited

Be thorough — search for at least 3-5 different queries to cover different angles.`,
      { maxSteps: 12 }
    );

    const text = result.text;
    // Rough count of sources cited (URLs in the text)
    const urlMatches = text.match(/https?:\/\/[^\s)]+/g);
    const sourceCount = urlMatches ? urlMatches.length : 0;

    return { report: text, sourceCount };
  },
});
