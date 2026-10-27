import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus/test/config";

/** Runner-only defaults; application Vite plugins never enter the test process. */
interface WorkspaceTestOptions {
  environment?: "node" | "jsdom";
  include?: string[];
  env?: Record<string, string>;
  setupFiles?: string[];
  fileParallelism?: boolean;
}

export function workspaceTests(options: WorkspaceTestOptions = {}) {
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

/** Keep pure and DOM cases in separate environments within one workspace runner. */
export function workspaceTestProjects(
  projects: (WorkspaceTestOptions & { name: string; include: string[] })[],
) {
  const shared = workspaceTests();
  return defineConfig({
    ...shared,
    test: {
      ...shared.test,
      include: [],
      projects: projects.map((project) => ({ test: { ...shared.test, ...project } })),
    },
  });
}
