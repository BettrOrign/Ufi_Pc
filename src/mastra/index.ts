import { Mastra } from '@mastra/core/mastra';
import { agent } from './agents/agent';
import { browserAgent } from './agents/browser-agent';

export const mastra = new Mastra({
  agents: { agent, browserAgent },
});
