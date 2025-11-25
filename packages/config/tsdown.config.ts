import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/envs.ts", "src/web.ts", "src/docs.ts"],
  dts: true,
  format: "esm",
  shims: true,
  sourcemap: true,
  clean: false,
  logLevel: "error",
  noExternal: ["@raypx/env"],
});
