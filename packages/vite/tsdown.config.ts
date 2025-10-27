import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/plugin.ts"],
  dts: true,
  shims: true,
  format: ["esm", "cjs"],
  logLevel: "error",
});
