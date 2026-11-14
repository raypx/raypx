import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BOOTSTRAP_E2E_WEB_URL ?? "http://127.0.0.1:56540";
const url = new URL(baseURL);
if (url.hostname !== "127.0.0.1" || url.protocol !== "http:")
  throw new Error("Bootstrap acceptance requires loopback HTTP");
export default defineConfig({
  testDir: "../apps/web/e2e",
  testMatch: "bootstrap.spec.ts",
  workers: 1,
  timeout: 120_000,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/bootstrap",
  projects: [
    {
      name: "web",
      use: { ...devices["Desktop Chrome"], baseURL, trace: "off", screenshot: "off", video: "off" },
    },
  ],
  webServer: {
    command: "bun --no-env-file ../apps/web/.output/server/index.mjs",
    url: baseURL,
    env: { NODE_ENV: "production", HOST: "127.0.0.1", PORT: url.port },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
