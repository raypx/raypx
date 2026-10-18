import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  staged: {
    "*.{ts,tsx,json,md,css,toml}": ["bun --bun vp fmt --write", "bun --bun vp lint --fix"],
  },
  lint: {
    ignorePatterns: [
      "**/dist/**",
      "**/.output/**",
      "**/node_modules/**",
      "docs/history/**",
      "**/*.gen.ts",
      "apps/desktop/.hutch/**",
      "apps/desktop/build/**",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    options: { typeAware: true, typeCheck: true },
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
  },
});
