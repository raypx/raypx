import { defineConfig, devices } from "@playwright/test";

if (process.env.RAYPX_LIVE_AGENTS !== "1")
  throw new Error(
    "Set RAYPX_LIVE_AGENTS=1 to run real inference against the configured HTTPS acceptance environment",
  );

export default defineConfig({
  testDir: "./tests",
  testMatch: "live-agents.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: "list",
  outputDir: "test-results/live-agents",
  use: {
    ...devices["Desktop Chrome"],
    headless: false,
    locale: "en-US",
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    trace: "off",
    screenshot: "only-on-failure",
  },
});
