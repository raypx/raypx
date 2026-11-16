import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../apps/web/e2e",
  projects: [
    { name: "public", testMatch: "public-origins.spec.ts" },
    { name: "restart", testMatch: "production-restart.spec.ts", dependencies: ["public"] },
  ],
  workers: 1,
  retries: 0,
  use: { headless: true, trace: "off" },
  reporter: "list",
  outputDir: "test-results/deployment",
});
