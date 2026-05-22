import { Mastra } from "@mastra/core/mastra";
import { agent } from "./agents/agent";
import { oscar } from "./agents/oscar";

export const mastra = new Mastra({
  agents: { agent, oscar },
});
