import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report/app", open: "never" }]],
  outputDir: "../../test-results/app",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "dev", use: { ...devices["Desktop Chrome"] } },
    { name: "prod", dependencies: ["dev"], use: { ...devices["Desktop Chrome"] } },
  ],
});
