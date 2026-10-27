import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus/test/config";

/** Runner-only defaults; application Vite plugins never enter the test process. */
export function workspaceTests(
  options: {
    environment?: "node" | "jsdom";
    include?: string[];
    env?: Record<string, string>;
    setupFiles?: string[];
    fileParallelism?: boolean;
  } = {},
) {
  return defineConfig({
    // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
    resolve: { dedupe: ["react", "react-dom"] },
    test: {
      environment: "node",
      // VP owns workspace parallelism; avoid multiplying its task budget per runner.
      maxWorkers: 1,
      // Keep jsdom's real DOM without Bun's unsupported VM WindowProxy brands.
      execArgv: [
        "--no-env-file",
        "--no-install",
        "--preload",
        fileURLToPath(new URL("./packages/tooling/tests/setup/jsdom-preload.ts", import.meta.url)),
      ],
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      coverage: { reporter: ["text", "json", "lcov"] },
      ...options,
    },
  });
}
