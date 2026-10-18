import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: "list",
  outputDir: "test-results",
  use: { ...devices["Desktop Chrome"], locale: "en-US", trace: "retain-on-failure" },
  projects: [{ name: "chromium" }],
  webServer: [
    {
      command: "bun run serve-web.ts",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: "bun run --cwd ../apps/desktop preview -- --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
