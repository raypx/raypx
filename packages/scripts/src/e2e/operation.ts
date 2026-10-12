import type { RepositoryProcessDependencies } from "../runtime/process-dependencies.js";
import { browserInvocation, browserSelection } from "./selection.js";

export async function runE2e(dependencies: RepositoryProcessDependencies, args: readonly string[]) {
  const selection = browserSelection(args);
  const env = { ...dependencies.processEnv };
  // A full run must not inherit a previous focused selection.
  delete env.RAYPX_E2E_GROUP;
  if (selection.group) env.RAYPX_E2E_GROUP = selection.group;
  dependencies.log("info", "e2e.started", {
    suite: selection.suite,
    group: selection.group ?? "all",
    listOnly: selection.listOnly,
  });
  await dependencies.runCommand(browserInvocation(selection), {
    cwd: dependencies.repositoryRoot,
    env,
  });
  dependencies.log("info", "e2e.completed");
}
