import { workspaceTaskConfig } from "@raypx/tooling/tasks";
import { packageCli } from "@raypx/tooling/build/cli";
import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

const builtAt = Date.now();
export default defineConfig({
  envPrefix: [],
  ...workspaceTaskConfig(import.meta.url),
  pack: {
    entry: { main: "src/main.ts" },
    platform: "node",
    format: "esm",
    fixedExtension: true,
    dts: false,
    minify: true,
    define: { __RAYPX_CLI_BUILT_AT__: String(builtAt) },
    deps: { alwaysBundle: [/.*/], neverBundle: [/^node:/], onlyBundle: false },
    inputOptions: { resolve: { conditionNames: ["node", "import", "default"] } },
    hooks: {
      "build:done": async ({ options }) => {
        await packageCli(resolve(import.meta.dirname, "../.."), resolve(options.outDir), builtAt);
      },
    },
  },
});
