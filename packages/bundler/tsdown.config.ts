import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  format: "esm",
  shims: true,
  clean: false,
  logLevel: "error",
});
