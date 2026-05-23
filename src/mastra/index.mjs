import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { agent } from "./agents/agent.mjs";
import { oscar } from "./agents/oscar.mjs";

export const mastra = new Mastra({
  agents: { agent, oscar },
  storage: new LibSQLStore({
    id: 'ufi-mastra-storage',
    url: 'file:./data/mastra.db',
  }),
});
