import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  globalSetup: "./tests/helpers/live-setup.ts",
  testDir: "./tests",
  testMatch: "live-agents.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: "list",
  outputDir: "test-results/live-agents",
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    locale: "en-US",
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    trace: "off",
    screenshot: "only-on-failure",
  },
});
