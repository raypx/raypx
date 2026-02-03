import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create a vitest config for packages (Node.js environment)
 */
export function createPackageConfig(options?: { include?: string[] }) {
  return defineConfig({
    test: {
      globals: true,
      environment: "node",
      include: options?.include ?? ["**/*.{test,spec}.{js,ts,tsx}"],
      passWithNoTests: true,
    },
  });
}

/**
 * Create a vitest config for apps (jsdom environment with coverage)
 */
export function createAppConfig(options?: { aliasPath?: string; include?: string[] }) {
  const aliasPath = options?.aliasPath ?? "../src";

  return defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      include: options?.include ?? ["**/*.{test,spec}.{js,ts,tsx}"],
      passWithNoTests: true,
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html", "lcov"],
        exclude: ["node_modules/", "dist/", ".turbo/", "**/*.config.*", "**/*.d.ts"],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, aliasPath),
      },
    },
  });
}

// Default export for compatibility
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: ["node_modules/", "dist/", ".turbo/", "**/*.config.*", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
  },
});
