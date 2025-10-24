import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/compile.ts", "src/envs.ts"],
  dts: true,
  shims: true,
  format: ["esm"],
  external: [/^@raypx\/i18n\/paraglide/],
});
