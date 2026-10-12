import type { RepositoryProcessDependencies } from "../runtime/process-dependencies.js";
import { browserInvocation, browserSelection } from "./selection.js";

export async function runE2e(dependencies: RepositoryProcessDependencies, args: readonly string[]) {
  const selection = browserSelection(args);
  const env = { ...dependencies.processEnv };
  const port = Number(env.RAYPX_E2E_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_533)
    throw new Error("RAYPX_E2E_PORT must reserve three valid consecutive ports.");
  // Browser bundles embed this URL: runtime server env cannot repair a stale build.
  env.VITE_API_URL = `http://127.0.0.1:${port + 2}`;
  // A full run must not inherit a previous focused selection.
  delete env.RAYPX_E2E_GROUP;
  if (selection.group) env.RAYPX_E2E_GROUP = selection.group;
  dependencies.log("info", "e2e.started", {
    suite: selection.suite,
    group: selection.group ?? "all",
    listOnly: selection.listOnly,
  });
  if (!selection.listOnly) {
    const apps = selection.suite === "all" ? ["api", "web", "desktop"] : ["api", selection.suite];
    await dependencies.runCommand(
      ["rpx", "tasks", "build", ...apps.flatMap((app) => ["--filter", app])],
      {
        cwd: dependencies.repositoryRoot,
        env: { ...env, NODE_ENV: "production" },
      },
    );
  }
  await dependencies.runCommand(browserInvocation(selection), {
    cwd: dependencies.repositoryRoot,
    env,
  });
  dependencies.log("info", "e2e.completed");
}
