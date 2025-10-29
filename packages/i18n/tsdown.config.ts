import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/vite.ts"],
  dts: true,
  shims: true,
  format: ["esm", "cjs"],
  logLevel: "error",
});
