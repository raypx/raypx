import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "devtools.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: "test-results/devtools",
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    colorScheme: "light",
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    { name: "web-devtools", use: { baseURL: "http://127.0.0.1:4300" } },
    { name: "desktop-devtools", use: { baseURL: "http://127.0.0.1:4301" } },
  ],
  webServer: ["web", "desktop"].map((surface, index) => ({
    command: `bun --bun vp dev --config vite.app.config.ts --host 127.0.0.1 --port ${4300 + index}`,
    cwd: `../apps/${surface}`,
    url: `http://127.0.0.1:${4300 + index}`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    timeout: 120_000,
    env: {
      // Dedicated loopback servers, with no operator account or external API.
      VITE_API_URL: "http://127.0.0.1:4399",
      VITE_DEVTOOLS_DISABLE_CLIENT_AUTH: "true",
    },
  })),
});
