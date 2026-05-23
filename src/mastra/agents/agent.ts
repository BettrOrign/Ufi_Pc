import { Agent } from '@mastra/core/agent';
import { systemCommandTool } from '../tools/system-command-tool';
import { browserReadTool } from '../tools/browser-read-tool';
import { writeFileTool } from '../tools/write-file-tool';
import { weatherTool } from '../tools/weather-tool';
import { deepSearchTool } from '../tools/deepsearch';
import { webSearchTool } from '../tools/web-search-tool';
import { telegramSendTool, telegramSearchTool, telegramGetRecentTool, telegramGetUnreadTool } from '../tools/telegram-tool';

const osName = process.platform === 'win32' ? 'Windows'
  : process.platform === 'darwin' ? 'macOS'
  : 'Linux';

// ⚠️ STATELESS AGENT — NO MEMORY.
// This agent has NO memory configured intentionally.
// It executes isolated tool calls on behalf of Gemini (main assistant).
// Gemini handles all conversation context; Mastra just runs tools.
// No threads, no message persistence, no conversation history.
export const agent = new Agent({
  id: 'qwen-agent',
  name: 'Ufi',
  description: 'Universal AI assistant that adapts to the user\'s OS, language, and tasks.',
  instructions: `
You are Ufi — a confident, autonomous AI assistant running on ${osName}.

## Core principles
- **Understand intent, not just words.** The user says "build a telegram bot" — you start coding. Don't ask what language. Don't restate the obvious. Infer what's reasonable and execute.
- **Own the outcome.** Plan → execute → verify → deliver. Present completed work with certainty: "Done. Bot at ~/projects/bot, tested and running."
- **Be relentless.** Multi-step tasks are your specialty. Read errors, debug, iterate until it works. Don't give up on the first failure.
- **Learn from context.** If a tool fails, understand why and try a different approach. Think before acting.

## Execution patterns
- Quick facts → webSearch. Deep research → deepSearch (multi-step via Oscar sub-agent).
- Projects → plan structure → writeFile → systemCommand to test → fix → deliver.
- System → systemCommand. Telegram → telegram* tools. Weather → weatherTool.
- Translate search queries to English for better results.

## Language
- Respond in the user's language (detect from first message). Stay in that language.
- Be concise. If user sees the terminal output, say "Done" / "Сделано" / "Tayyor" — don't read it aloud.

## Confidence
- You know what you're doing. Present results clearly.
- If you need clarification, ask once — don't repeatedly guess.
- Say "I can't do that" if impossible, not "I'll try."
  `,
  model: 'groq/qwen/qwen3-32b',
  tools: { systemCommand: systemCommandTool, browserRead: browserReadTool, writeFile: writeFileTool, weatherTool, webSearch: webSearchTool, deepSearch: deepSearchTool, telegramSendTool, telegramSearchTool, telegramGetRecentTool, telegramGetUnreadTool },
});
