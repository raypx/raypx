import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    "config/index": "./src/config/index.ts",
    "utils/index": "./src/utils/index.ts",
    "logger/index": "./src/logger/index.ts",
    "registry/index": "./src/registry/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2020",
  logLevel: "error",
});
