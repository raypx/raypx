import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/plugins.ts", "src/presets.ts", "src/utils.ts"],
  dts: true,
  format: "esm",
  shims: true,
  sourcemap: true,
  clean: false,
  logLevel: "error",
});

