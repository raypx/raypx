import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  // `.vite-hooks/pre-commit` invokes this locally after `vp hooks enable`.
  staged: {
    "*.{ts,tsx,json,md,css,toml}": ["bun --bun vp fmt --write", "bun --bun vp lint --fix"],
  },
  lint: {
    // Tracked compiler output is verified through its source workspaces.
    ignorePatterns: ["packages/*/dist/**"],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "raypx", specifier: "./packages/scripts/src/lint/plugin.ts" },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "raypx/boundaries": "error",
    },
  },
});
