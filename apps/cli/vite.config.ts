import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: { main: "src/main.ts" },
    platform: "node",
    format: "esm",
    fixedExtension: true,
    dts: false,
    minify: true,
    deps: {
      alwaysBundle: [/.*/],
      neverBundle: [/^bun:/],
      onlyBundle: false,
    },
    inputOptions: {
      resolve: { conditionNames: ["bun", "node", "import", "default"] },
    },
    hooks: {
      "build:done": async ({ options }) => {
        // The repository packageManager pins the runtime embedded in the standalone binary.
        const { packageManager } = await Bun.file(
          resolve(import.meta.dirname, "../../package.json"),
        ).json();
        if (`bun@${Bun.version}` !== packageManager)
          throw new Error(`CLI artifacts must be compiled with ${packageManager}`);

        const result = await Bun.build({
          entrypoints: [resolve(options.outDir, "main.mjs")],
          compile: {
            outfile: resolve(options.outDir, process.platform === "win32" ? "raypx.exe" : "raypx"),
          },
          target: "bun",
          define: { __RAYPX_CLI_BUILT_AT__: String(Date.now()) },
          // Keep ESM so bytecode compilation supports the entrypoint's top-level await.
          format: "esm",
          bytecode: true,
        });
        if (!result.success)
          throw new AggregateError(result.logs, "CLI executable compilation failed");
      },
    },
  },
});
