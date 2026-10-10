import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}": "vp check --fix --no-error-on-unmatched-pattern",
    "*.{json,jsonc,md,mdx,css,scss,html,yml,yaml}": "vp fmt --no-error-on-unmatched-pattern",
  },
  test: {
    projects: ["apps/*/vite.config.ts", "packages/*/vite.config.ts", "scripts/vite.config.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      // --project makes coverage patterns relative to the selected project's root.
      include: [
        "apps/*/src/**/*.{ts,tsx}",
        "packages/*/src/**/*.{ts,tsx}",
        "scripts/lib/**/*.ts",
        "src/**/*.{ts,tsx}",
        "lib/**/*.ts",
      ],
      exclude: ["**/routeTree.gen.ts"],
    },
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
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "typescript/no-floating-promises": "error",
      "typescript/no-misused-promises": "error",
      "react/rules-of-hooks": "error",
    },
    overrides: [
      {
        files: ["**/*.{test,spec}.{ts,tsx}"],
        plugins: ["vitest"],
        rules: {
          "vitest/no-focused-tests": "error",
          "vitest/valid-expect": "error",
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
});
