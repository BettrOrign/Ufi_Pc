import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getStagehand } from "./stagehand-manager";

export const stagehandAgentTool = createTool({
  id: "stagehand-agent",
  description:
    "Execute complex multi-step browser tasks using natural language. " +
    "Describe the full task in one go (e.g., 'Go to youtube.com, search for lofi hip hop, and play the first video'). " +
    "The agent handles all navigation, clicking, typing, waiting, and scrolling automatically. " +
    "Use this INSTEAD of individual goto/click/type tools for tasks that need multiple steps.",
  inputSchema: z.object({
    task: z
      .string()
      .describe(
        "The full task to execute in the browser, described in natural language. " +
          "Be specific about what to do. Example: 'Go to youtube.com, search for relaxing jazz music, and play the first result'"
      ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    url: z.string().optional(),
    title: z.string().optional(),
    steps: z.number().optional(),
  }),
  execute: async ({ task }) => {
    try {
      const stagehand = await getStagehand();
      const agent = stagehand.agent({
        model: "google/gemini-2.0-flash",
        systemPrompt:
          "You are a browser assistant. The user gives you tasks like 'go to youtube and play lofi music' or 'find iPhone on ozon'. Complete them naturally using the browser. Report what you did concisely.",
        mode: "dom",
      });

      const result = await agent.execute({
        instruction: task,
        maxSteps: 30,
      });

      // Get current page info
      let url: string | undefined;
      let title: string | undefined;
      try {
        const pages = stagehand.context.pages();
        if (pages.length > 0) {
          try { url = pages[0].url(); } catch {}
          try { title = await (pages[0] as any).title(); } catch {}
        }
      } catch {
        // Page might not be available yet
      }

      return {
        success: result.completed ?? true,
        message: result.message || "Task completed successfully",
        url,
        title,
        steps: result.actions?.length,
      };
    } catch (err: any) {
      console.error("[StagehandAgent] Error:", err.message);
      return {
        success: false,
        message: `Error: ${err.message}`,
      };
    }
  },
});
