import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ALLOWED_PREFIX = '/home/sirius/Projects/';

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
      const resolved = resolve(path);
      if (!resolved.startsWith(ALLOWED_PREFIX)) {
        return {
          message: `Access denied: path must be under ${ALLOWED_PREFIX}`,
          path,
          error: 'Access denied',
        };
      }
      const dir = dirname(resolved);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(resolved, content, 'utf-8');
      const byteSize = new TextEncoder().encode(content).length;
      return {
        message: `File created: ${resolved} (${byteSize} bytes)`,
        path: resolved,
        size: byteSize,
      };
    } catch (err) {
      return {
        message: `Failed to write file: ${err.message}`,
        path,
        error: err.message,
      };
    }
  },
});
