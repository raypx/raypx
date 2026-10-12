import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
  // `.vite-hooks/pre-commit` invokes this locally after `vp hooks enable`.
  staged: {
    "*.{ts,tsx,json,md,css,toml}": ["vp fmt --write", "vp lint --fix"],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
});
