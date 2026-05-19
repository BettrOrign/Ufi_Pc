import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

export const writeFileTool = createTool({
  id: 'write-file',
  description: 'Create or overwrite a file with text content. Use this INSTEAD of "echo >" which does not work with system commands. Supports creating parent directories automatically.',
  inputSchema: z.object({
    path: z.string().describe('Full file path (e.g., /home/sirius/Projects/game/index.html)'),
    content: z.string().describe('Text content to write to the file'),
  }),
  outputSchema: z.object({
    message: z.string(),
    path: z.string(),
    size: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ path, content }) => {
    try {
      const dir = dirname(path);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(path, content, 'utf-8');
      const byteSize = new TextEncoder().encode(content).length;
      return {
        message: `File created: ${path} (${byteSize} bytes)`,
        path,
        size: byteSize,
      };
    } catch (err) {
      return {
        message: `Failed to write file: ${(err as Error).message}`,
        path,
        error: (err as Error).message,
      };
    }
  },
});
