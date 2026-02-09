import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    providers: "./src/providers/index.ts",
    services: "./src/services/index.ts",
    cache: "./src/cache/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2020",
  logLevel: "error",
});
