import { defineConfig, devices } from "@playwright/test";
import { availableParallelism, totalmem } from "node:os";
import { browserTestSettings } from "./browser-settings.ts";
import { web, desktop } from "./tests/helpers/surfaces.js";

const settings = browserTestSettings(process.env, {
  cpus: availableParallelism(),
  memoryBytes: totalmem(),
});

export default defineConfig({
  testDir: "..",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: settings.workers,
  reporter: "list",
  outputDir: `test-results/${settings.surface}`,
  ...(settings.grep ? { grep: settings.grep } : {}),
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    locale: "en-US",
    trace: settings.trace,
    screenshot: "only-on-failure",
  },
  projects: [
    ...(["web", "desktop"] as const)
      .filter((project) => settings.surface === "all" || settings.surface === project)
      .map((project) => ({
        name: project,
        testDir: `../apps/${project}/e2e`,
        use: { baseURL: project === "web" ? web : desktop },
      })),
    ...(process.env.CONTROL_E2E_API_URL && settings.surface === "all"
      ? [{ name: "control", testMatch: "**/e2e/tests/control.spec.ts" }]
      : []),
  ],
  webServer: [
    ...(settings.surface === "desktop"
      ? []
      : [
          {
            command: "bun run tests/helpers/serve-web.ts",
            url: "http://127.0.0.1:4173",
            reuseExistingServer: false,
            timeout: 30000,
          },
        ]),
    ...(settings.surface === "web"
      ? []
      : [
          {
            command: "bun run tests/helpers/serve-desktop.ts",
            url: "http://127.0.0.1:4174",
            reuseExistingServer: false,
            timeout: 30000,
          },
        ]),
  ],
});
