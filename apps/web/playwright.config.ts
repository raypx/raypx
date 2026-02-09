import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables or use defaults
 */
const PORT = process.env.PORT || process.env.PLAYWRIGHT_PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

/**
 * Playwright end-to-end test configuration
 * See https://playwright.dev/docs/test-configuration for more information
 */
export default defineConfig({
  testDir: "./e2e",
  /* Only match test files using @playwright/test */
  testMatch: /.*\.test\.ts$/,
  /* Run tests in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use */
  reporter: process.env.CI ? [["html"], ["github"]] : [["html"], ["list"]],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: BASE_URL,
    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",
    /* Take a screenshot when a test fails */
    screenshot: "only-on-failure",
    /* Record video on failure */
    video: "retain-on-failure",
  },

  /* Configure projects for major browsers - only Chromium (Chrome) */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "pnpm --filter web dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
