import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus/test/config";

const domSetup = fileURLToPath(new URL("./packages/tooling/tests/setup/dom.ts", import.meta.url));

/** Runner-only defaults; application Vite plugins never enter the test process. */
interface WorkspaceTestOptions {
  environment?: "node" | "happy-dom";
  include?: string[];
  env?: Record<string, string>;
  setupFiles?: string[];
  fileParallelism?: boolean;
  /** Raise only for long-tail suites; VP already runs workspaces concurrently. */
  maxWorkers?: number;
}

export function workspaceTests(options: WorkspaceTestOptions = {}) {
  return defineConfig({
    // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
    resolve: { dedupe: ["react", "react-dom"] },
    test: {
      environment: "node",
      // VP owns workspace parallelism; avoid multiplying its task budget per runner.
      maxWorkers: 1,
      execArgv: ["--no-env-file", "--no-install"],
      include: ["tests/**/*.{test,spec}.{ts,tsx}"],
      coverage: { reporter: ["text", "json", "lcov"] },
      ...options,
      setupFiles: [domSetup, ...(options.setupFiles ?? [])],
    },
  });
}

/** Keep pure and DOM cases in separate environments within one workspace runner. */
export function workspaceTestProjects(
  projects: (WorkspaceTestOptions & { name: string; include: string[] })[],
  options: Pick<WorkspaceTestOptions, "maxWorkers"> = {},
) {
  const shared = workspaceTests(options);
  return defineConfig({
    ...shared,
    test: {
      ...shared.test,
      include: [],
      projects: projects.map((project) => ({
        test: { ...shared.test, ...project, setupFiles: [domSetup, ...(project.setupFiles ?? [])] },
      })),
    },
  });
}
