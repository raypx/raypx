import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus/test/config";

/** Runner-only defaults; application Vite plugins never enter the test process. */
export function workspaceTests(
  options: {
    environment?: "node" | "jsdom";
    include?: string[];
    env?: Record<string, string>;
    setupFiles?: string[];
  } = {},
) {
  return defineConfig({
    // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
    resolve: { dedupe: ["react", "react-dom"] },
    test: {
      environment: "node",
      // Turbo already runs workspaces in parallel; bound each runner's process pool.
      maxWorkers: Math.min(2, Math.max(availableParallelism() - 1, 1)),
      // Keep jsdom's real DOM without Bun's unsupported VM WindowProxy brands.
      execArgv: [
        "--no-env-file",
        "--no-install",
        "--preload",
        fileURLToPath(new URL("./packages/tooling/src/testing/jsdom-preload.ts", import.meta.url)),
      ],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      coverage: { reporter: ["text", "json", "lcov"] },
      ...options,
    },
  });
}
