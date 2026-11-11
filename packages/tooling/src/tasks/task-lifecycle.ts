import type { TaskModel } from "./model.ts";

export function taskLifecycleInputs(apiPath: string) {
  return [`${apiPath}/tests/fixtures/task-lifecycle-relay.ts`, `${apiPath}/tests/helpers/relay.ts`];
}

/** The CLI lifecycle suite launches the API fixture as a subprocess. */
export function relatedTaskLifecycle(model: TaskModel, files: readonly string[]) {
  const api = model.members.find((member) => member.name === "api");
  const cli = model.members.find((member) => member.name === "cli" && member.scripts.test);
  if (!api || !cli) return;
  if (taskLifecycleInputs(api.path).some((file) => files.includes(file)))
    return { workspace: cli.name, file: "tests/integration/runtime/daemon/task-lifecycle.test.ts" };
}
