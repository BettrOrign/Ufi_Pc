import { Agent } from "@mastra/core/agent";
import { webSearchTool } from "../tools/web-search-tool";
import { browserReadTool } from "../tools/browser-read-tool";

export const oscar = new Agent({
  id: "deepsearch-agent",
  name: "Oscar",
  description:
    "Oscar is agent for deep searching information from internet and give it to assistent",
  instructions: `you are professional researcher
    1. Use the webSearch to get information from internet, and browserRead to read sites
    2. use popular and verified sources like https://www.wikipedia.org/ or https://www.bbc.com/
    3. get facts, pictures, teories, sources, locates
    4. return structured response with all information`,
  model: "opencode/big-pickle",
  tools: {
    webSearch: webSearchTool,
    browserRead: browserReadTool,
  },
});
