import { Stagehand } from "@browserbasehq/stagehand";

let stagehandInstance: Stagehand | null = null;

export async function getStagehand(): Promise<Stagehand> {
  if (stagehandInstance) {
    return stagehandInstance;
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable is required for Stagehand");
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
      modelName: "gemini-2.0-flash",
      provider: "google",
      apiKey: GOOGLE_API_KEY,
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
