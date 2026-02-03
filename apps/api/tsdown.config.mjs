import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  // Only bundle the code itself, not dependencies
  inlineOnly: true,
  // dts: true,
  // sourcemap: true,
  noExternal: [
    "@raypx/core",
    "@raypx/database",
    "@raypx/auth",
    "@raypx/rpc",
    "@raypx/logger",
    "@raypx/env",
  ],
});
