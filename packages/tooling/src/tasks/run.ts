import { run } from "@raypx-kit/devkit/process";
import {
  parseTaskInvocation,
  prepareTaskDirectories,
  argumentKey,
  taskRef,
  taskPlan,
  taskName,
  type RunTasksOptions,
  type TaskMember,
  type TaskModel,
} from "@raypx-kit/devkit/tasks";

/** The devkit's model is runtime independent; Raypx launches VP through pnpm. */
export async function executeTasks<M extends TaskMember>(
  model: TaskModel<M>,
  task: string,
  args: string[],
  options: RunTasksOptions<M>,
) {
  const invocation = parseTaskInvocation(
    model.rootName,
    task,
    args,
    options.allowFilteredArguments,
  );
  const reference = taskRef(invocation.owner, invocation.name);
  const plan = taskPlan(model, [reference]);
  if (invocation.dry) {
    options.printPlan?.(plan);
    return;
  }
  prepareTaskDirectories(model, options.directories);
  const base = options.prepareEnvironment?.(invocation, plan) ?? process.env;
  const environment: NodeJS.ProcessEnv = {
    ...base,
    ...options.environment,
    VP_RUN_CONCURRENCY_LIMIT:
      options.environment?.VP_RUN_CONCURRENCY_LIMIT ?? base.VP_RUN_CONCURRENCY_LIMIT ?? "2",
  };
  for (const member of model.members.filter(
    (candidate) =>
      (invocation.owner === model.rootName || candidate.name === invocation.owner) &&
      candidate.scripts[invocation.name],
  )) {
    const key = argumentKey(taskRef(member.name, invocation.name));
    if (invocation.forwarded.length) environment[key] = JSON.stringify(invocation.forwarded);
    else delete environment[key];
  }
  await run(
    "pnpm",
    [
      "exec",
      "vp",
      "run",
      "--fail-if-no-match",
      "--log",
      "labeled",
      ...invocation.options,
      invocation.filtered ? taskName(invocation.name) : reference,
    ],
    model.root,
    environment,
  );
}
