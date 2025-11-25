import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/config.ts", "src/vite.ts"],
  dts: true,
  format: "esm",
  shims: true,
  sourcemap: true,
  clean: false,
  logLevel: "error",
});
