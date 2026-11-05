import { workspaceTaskConfig } from "@raypx/tooling/tasks";
import { defineConfig } from "vite-plus";

export default defineConfig({
  ...workspaceTaskConfig(import.meta.url),
  pack: {
    entry: { deployment: "tests/fixtures/deployment.ts" },
    outDir: "artifacts/fixture",
    platform: "node",
    format: "esm",
    fixedExtension: true,
    dts: false,
    deps: { alwaysBundle: [/.*/], neverBundle: [/^node:/], onlyBundle: false },
  },
});
