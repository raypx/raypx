import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          [
            require.resolve("babel-plugin-react-compiler"),
            {
              target: "19",
            },
          ],
        ],
      },
    }),
  ],
  test: {
    globals: true,
    // Test files are located in tests/ directory (co-located with src/)
    // Exclude Playwright test files to avoid conflicts with Playwright's global symbols
    // Playwright tests should be run using the separate playwright test command
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/e2e/**", // Exclude E2E tests (use standalone Playwright)
      "**/src/**", // Exclude src directory (tests are in tests/ directory)
    ],
    passWithNoTests: true,

    // Use projects to support both Node.js and Browser testing
    projects: [
      {
        // Unit and component tests using jsdom
        // Test files are in tests/ directory
        test: {
          name: "node",
          include: ["tests/**/*.test.{ts,tsx}", "!**/*.browser.test.{ts,tsx}", "!**/e2e/**"],
          environment: "jsdom",
        },
      },
      {
        // Browser mode tests
        test: {
          name: "browser",
          include: ["tests/**/*.browser.test.{ts,tsx}", "!**/e2e/**"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],

    setupFiles: [],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/*.config.*"],
    },
  },
});
