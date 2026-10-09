import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["apps/*/vite.config.ts", "packages/*/vite.config.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
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
    ignorePatterns: ["**/routeTree.gen.ts", "**/.output/**", "**/dist/**"],
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
    ignorePatterns: ["**/routeTree.gen.ts", "**/.output/**", "**/dist/**"],
    // Keep tsc as the authoritative type checker for both workspace packages.
    options: { typeAware: true, typeCheck: false },
  },
});
