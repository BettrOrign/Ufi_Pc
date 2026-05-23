import { Agent } from "@mastra/core/agent";
import { webSearchTool } from "../tools/web-search-tool.mjs";
import { browserReadTool } from "../tools/browser-read-tool.mjs";

function createOscar() {
  if (!process.env.OPENCODE_API_KEY) {
    console.warn('[Oscar] OPENCODE_API_KEY not set — Oscar agent will use fallback model');
  }
  return new Agent({
    id: "deepsearch-agent",
    name: "Oscar",
    description:
      "Oscar is agent for deep searching information from internet and give it to assistent",
    instructions: `you are professional researcher
    1. Use the webSearch to get information from internet, and browserRead to read sites
    2. use popular and verified sources like https://www.wikipedia.org/ or https://www.bbc.com/
    3. get facts, pictures, teories, sources, locates
    4. return structured response with all information`,
    model: process.env.OPENCODE_API_KEY ? "opencode/big-pickle" : "groq/qwen/qwen3-32b",
    tools: {
      webSearch: webSearchTool,
      browserRead: browserReadTool,
    },
  });
}

export const oscar = createOscar();
