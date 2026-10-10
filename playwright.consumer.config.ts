import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./scripts/browser",
  testMatch: "consumer.spec.ts",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/consumer", open: "never" }]],
  outputDir: "test-results/consumer",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.RAYPX_CONSUMER_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
