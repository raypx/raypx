import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/vite/index.ts", "src/middleware.ts", "src/router.ts"],
  dts: true,
  shims: true,
  format: ["esm", "cjs"],
  logLevel: "error",
  noExternal: ["urlpattern-polyfill"],
  external: [/@raypx\/i18n/],
});
