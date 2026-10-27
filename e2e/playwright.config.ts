import { defineConfig, devices } from "@playwright/test";
import { browserTestSettings } from "@raypx/tooling/browser-tests";
import { availableParallelism, totalmem } from "node:os";

const settings = browserTestSettings(process.env, {
  cpus: availableParallelism(),
  memoryBytes: totalmem(),
});

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: settings.workers,
  reporter: "list",
  outputDir: "test-results",
  ...(settings.grep ? { grep: settings.grep } : {}),
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    locale: "en-US",
    trace: settings.trace,
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium" }],
  webServer: [
    ...(settings.surface === "desktop"
      ? []
      : [
          {
            command: "bun run tests/helpers/serve-web.ts",
            url: "http://127.0.0.1:4173",
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
          },
        ]),
    ...(settings.surface === "web"
      ? []
      : [
          {
            command: "bun run tests/helpers/serve-desktop.ts",
            url: "http://127.0.0.1:4174",
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
          },
        ]),
  ],
});
