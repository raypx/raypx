import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  staged: {
    "*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}": "vp check --fix --no-error-on-unmatched-pattern",
    "*.{json,jsonc,md,mdx,css,scss,html,yml,yaml}": "vp fmt --no-error-on-unmatched-pattern",
  },
  fmt: {
    useTabs: false,
    tabWidth: 2,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    endOfLine: "lf",
    ignorePatterns: [
      "**/routeTree.gen.ts",
      "**/.output/**",
      "**/dist/**",
      "**/storybook-static/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y"],
    categories: { correctness: "error" },
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "raypx", specifier: "./oxlint-plugins/raypx-plugin.ts" },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "typescript/no-floating-promises": "error",
      "typescript/no-misused-promises": "error",
      "react/rules-of-hooks": "error",
      "raypx/enforce-public-exports": "error",
      "raypx/no-server-in-client": "error",
      "raypx/prefer-workspace-alias": "warn",
    },
    overrides: [
      {
        files: ["**/*.{test,spec}.{ts,tsx}"],
        plugins: ["vitest"],
        rules: {
          "vitest/no-focused-tests": "error",
          "vitest/valid-expect": "error",
          // Tests can import from internal paths for testing
          "raypx/enforce-public-exports": "off",
        },
      },
      {
        files: ["scripts/**/*.ts"],
        rules: {
          // Scripts use relative imports for simplicity
          "raypx/prefer-workspace-alias": "off",
        },
      },
    ],
    ignorePatterns: [
      "**/routeTree.gen.ts",
      "**/.output/**",
      "**/dist/**",
      "**/storybook-static/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
    // Keep tsc as the authoritative type checker for workspaces and root scripts.
    options: { typeAware: true, typeCheck: false, denyWarnings: true },
  },
  test: {
    // Global test reporter configuration
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}", "scripts/lib/**/*.ts"],
      exclude: [
        "**/routeTree.gen.ts",
        "**/*.d.ts",
        "**/*.{test,spec}.{ts,tsx}",
        "**/test/**",
        "**/dist/**",
      ],
    },

    // Multi-project configuration
    projects: [
      "apps/*/vite.config.ts",
      "apps/*/vite.integration.config.ts",
      "packages/*/vite.config.ts",
      "scripts/vite.config.ts",
    ],
  },
});
