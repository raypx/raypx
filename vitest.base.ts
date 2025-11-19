import type { UserConfig } from "vite";
import { mergeConfig } from "vitest/config";

/**
 * Base vitest configuration shared across all packages
 */
export const baseVitestConfig: UserConfig = {
  test: {
    globals: true,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.turbo/**"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", "dist", "**/*.config.*"],
    },
  },
};

/**
 * Base config for Node.js environment
 */
export function createNodeConfig(overrides?: UserConfig): UserConfig {
  return mergeConfig(baseVitestConfig, {
    test: {
      environment: "node",
      ...overrides?.test,
    },
    ...overrides,
  });
}

/**
 * Base config for React/jsdom environment
 */
export function createReactConfig(overrides?: UserConfig): UserConfig {
  return mergeConfig(baseVitestConfig, {
    test: {
      environment: "jsdom",
      setupFiles: [],
      ...overrides?.test,
    },
    ...overrides,
  });
}
