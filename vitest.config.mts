import { defineConfig } from "vitest/config";

// Root vitest config - used when running tests from root
// Individual packages have their own vitest.config.ts files
export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    // Only include root-level tests if any
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "**/.turbo/**"],
  },
});
