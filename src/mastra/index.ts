import { Mastra } from '@mastra/core/mastra';
import { google } from '@mastra/google';
import { agent } from './agents/agent';
import { weatherAgent } from './agents/weather-agent';
import { browserAgent } from './agents/browser-agent';

// Forward Google API key to the format Google provider expects
if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

export const mastra = new Mastra({
  agents: { agent, weatherAgent, browserAgent },
});
