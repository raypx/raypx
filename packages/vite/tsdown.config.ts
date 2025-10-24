import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/plugin.ts"],
  dts: true,
  format: ["esm", "cjs"],
});
