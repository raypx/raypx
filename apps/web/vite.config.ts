import { fileURLToPath } from "node:url";
import {
  serverOnlySpecifierPatterns,
  workspaceCacheInputs,
  workspaceSourceAliases,
} from "@raypx/config/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: mode === "test" ? workspaceSourceAliases() : undefined,
  },
  plugins:
    mode === "test"
      ? []
      : lazyPlugins(async () => {
          const [{ tanstackStart }, { nitro }, { default: react }, { default: tailwindcss }] =
            await Promise.all([
              import("@tanstack/react-start/plugin/vite"),
              import("nitro/vite"),
              import("@vitejs/plugin-react"),
              import("@tailwindcss/vite"),
            ]);
          return [
            tanstackStart({
              importProtection: {
                behavior: "error",
                include: ["src/**", "../../packages/**"],
                client: {
                  specifiers: serverOnlySpecifierPatterns,
                  excludeFiles: [],
                },
              },
            }),
            nitro({
              preset: "bun",
              plugins: [fileURLToPath(new URL("./server/plugins/runtime.ts", import.meta.url))],
            }),
            tailwindcss(),
            react(),
          ];
        }),
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  test: {
    name: "web",
    environment: "node",
    include: ["test/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
  },
  run: {
    tasks: {
      dev: { command: "vp dev", cache: false },
      build: {
        command: "vp build",
        dependsOn: [{ task: "build", from: "dependencies" }],
        cache: {
          // Shell depth and script metadata do not affect the build output.
          env: ["!SHLVL", "!npm_lifecycle_event", "!npm_lifecycle_script"],
          untrackedEnv: ["SHLVL", "npm_lifecycle_event", "npm_lifecycle_script"],
          input: [...workspaceCacheInputs(import.meta.url), "!src/routeTree.gen.ts"],
          output: [".output/**", "src/routeTree.gen.ts"],
        },
      },
      start: { command: "bun .output/server/index.mjs", cache: false },
      typecheck: { command: "tsc --noEmit", dependsOn: ["build"] },
      test: {
        command: "vp test run",
        dependsOn: ["build"],
      },
    },
  },
}));
