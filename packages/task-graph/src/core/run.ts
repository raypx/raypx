import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { run } from "../process.js";
import { argumentKey, parseTaskInvocation, taskArguments } from "./arguments.js";
import { taskName, taskPlan, taskRef } from "./model.js";
import type { TaskInvocation, TaskMember, TaskModel } from "./types.js";

export interface RunTasksOptions<M extends TaskMember> {
  runtime: string;
  environment?: NodeJS.ProcessEnv;
  allowFilteredArguments?: boolean;
  directories?(this: void, member: M): string[];
  prepareEnvironment?(
    invocation: TaskInvocation,
    plan: ReturnType<typeof taskPlan<M>>,
  ): NodeJS.ProcessEnv;
  printPlan?(plan: ReturnType<typeof taskPlan<M>>): void;
}
export function prepareTaskDirectories<M extends TaskMember>(
  model: TaskModel<M>,
  directories?: (member: M) => string[],
) {
  mkdirSync(join(model.root, ".artifacts"), { recursive: true });
  for (const member of model.members)
    for (const directory of directories?.(member) ?? ["dist", ".output", ".artifacts"])
      mkdirSync(join(model.root, member.path, directory), { recursive: true });
}
/** Launch one VP invocation. VP alone schedules and caches its dependencies. */
export async function runTasks<M extends TaskMember>(
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
    if (options.printPlan) options.printPlan(plan);
    else console.log(JSON.stringify(plan, null, 2));
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
    options.runtime,
    [
      "--bun",
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

export interface TaskLeafOptions {
  runtime: string;
  name?: string;
  cwd?: string;
  command?(
    manifest: { name: string; scripts: Record<string, string>; [key: string]: unknown },
    name: string,
    args: string[],
  ): string[];
}
export async function runTaskLeaf(options: TaskLeafOptions): Promise<number> {
  const name = options.name ?? process.argv[2];
  if (name === "--aggregate") return 0;
  if (!name) throw new Error("A workspace task name is required");
  const cwd = options.cwd ?? process.cwd();
  const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  if (!manifest.scripts?.[name]) throw new Error(`Unknown workspace script: ${name}`);
  const args = taskArguments(`${manifest.name}#${name}`, process.env);
  const [binary, ...command] = options.command?.(manifest, name, args) ?? [
    options.runtime,
    "run",
    name,
    ...args,
  ];
  if (!binary) throw new Error("Task command requires an executable");
  return new Promise((resolve, reject) => {
    const child = spawn(binary, command, {
      cwd,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code) => {
      cleanup();
      resolve(code ?? 1);
    });
  });
}
