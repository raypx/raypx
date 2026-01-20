import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  noExternal: [
    "@raypx/core",
    "@raypx/database",
    "@raypx/auth",
    "@raypx/billing",
    "@raypx/rpc",
    "@raypx/logger",
    "@raypx/env",
    "@raypx/observability",
    "@raypx/redis",
  ],
});
