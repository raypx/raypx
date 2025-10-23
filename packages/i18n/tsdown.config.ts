import { defineConfig } from "tsdown";

export default defineConfig({
  dts: true,
  entry: ["src/*.ts"],
  shims: true,
  external: (id) => {
    return id.includes("/paraglide/");
  },
  format: ["esm", "cjs"],
  logLevel: "error",
});
