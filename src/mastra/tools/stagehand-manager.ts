import { Stagehand } from "@browserbasehq/stagehand";

let stagehandInstance: Stagehand | null = null;

export async function getStagehand(): Promise<Stagehand> {
  if (stagehandInstance) {
    return stagehandInstance;
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY environment variable is required for Stagehand");
  }

  stagehandInstance = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: false,
      executablePath: "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
      viewport: { width: 1280, height: 800 },
    },
    model: {
      modelName: "groq-llama-3.3-70b-versatile",
      provider: "groq",
      apiKey: GROQ_API_KEY,
    },
    verbose: 0,
    domSettleTimeout: 3000,
  });

  await stagehandInstance.init();
  return stagehandInstance;
}

export async function closeStagehand(): Promise<void> {
  if (stagehandInstance) {
    try {
      await stagehandInstance.close();
    } catch (err) {
      console.error("[Stagehand] Error closing:", err);
    }
    stagehandInstance = null;
  }
}

// Cleanup on process exit
process.on("exit", () => {
  if (stagehandInstance) {
    stagehandInstance.close().catch(() => {});
  }
});
