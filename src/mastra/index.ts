import { Mastra } from '@mastra/core/mastra';
import { agent } from './agents/agent';

export const mastra = new Mastra({
  agents: { agent },
});
