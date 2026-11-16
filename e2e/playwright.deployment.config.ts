import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../apps/web/e2e",
  testMatch: "public-origins.spec.ts",
  workers: 1,
  retries: 0,
  use: { headless: true, trace: "off" },
  reporter: "list",
  outputDir: "test-results/deployment",
});
