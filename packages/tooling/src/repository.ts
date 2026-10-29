import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { developmentEnvironment, run } from "@raypx-kit/devkit/process";
import { discover as discoverWorkspaces } from "@raypx-kit/devkit/workspaces";
import { isBrowserTestTask, prepareBrowserTask } from "./browser-tests.js";
import {
  argumentKey,
  taskModel,
  taskName,
  taskPlan,
  taskRef,
  type TaskModel,
} from "./tasks/model.js";

/** Raypx conventions for the shared @raypx-kit/devkit checks. */
export const discover = (root: string) => discoverWorkspaces(root, { metadataKey: "raypx" });

/** Directory enumeration is traced separately from excluded output contents. */
export function prepareTaskDirectories(model: TaskModel) {
  mkdirSync(join(model.root, ".artifacts"), { recursive: true });
  for (const member of model.members.filter((candidate) => candidate.native))
    for (const directory of ["generated", "resources/bin", "build", ".mygo", "artifacts/browser"])
      mkdirSync(join(model.root, member.path, directory), { recursive: true });
}

export async function runTasks(
  root: string,
  task: string,
  args: string[] = [],
  environment: Record<string, string> = {},
): Promise<void> {
  const separator = task.lastIndexOf("#");
  const owner = separator < 0 ? undefined : task.slice(0, separator);
  const name = separator < 0 ? task : task.slice(separator + 1);
  const browser = isBrowserTestTask(name) ? prepareBrowserTask(name, args, environment) : undefined;
  const values = browser?.args ?? args;
  const split = values.indexOf("--");
  const flags = split < 0 ? values : values.slice(0, split);
  const forwarded = split < 0 ? [] : values.slice(split + 1);
  const dry = flags.includes("--dry-run") || flags.includes("--dry=json");
  const options = flags
    .filter((value) => !["--dry-run", "--dry=json"].includes(value))
    .map((value) =>
      value === "--summarize"
        ? "--verbose"
        : value === "--concurrency"
          ? "--concurrency-limit"
          : value.replace(/^--concurrency=/, "--concurrency-limit="),
    );
  const model = taskModel(root, environment.RAYPX_VERIFY_TASKS);
  const filtered = options.some((value) => value === "--filter" || value.startsWith("--filter="));
  if (owner && filtered) throw new Error("Use either a qualified task or workspace filters");
  if (filtered && forwarded.length)
    throw new Error("Use package#task when forwarding arguments to one filtered workspace");
  if (dry && filtered) throw new Error("Use package#task to inspect a filtered task plan");
  const reference = taskRef(owner ?? model.rootName, name);
  if (dry) {
    console.log(JSON.stringify({ runner: "vp", tasks: taskPlan(model, [reference]) }));
    return;
  }
  prepareTaskDirectories(model);
  const verb = name.split(":")[0];
  const planned = taskPlan(model, [reference]);
  const preparesEnvironment =
    ["dev", "build"].includes(verb!) ||
    planned.some((entry) => /#(?:build(?::renderer)?|dev)$/.test(entry.taskId));
  const environmentBase = preparesEnvironment ? developmentEnvironment(root) : process.env;
  const env: NodeJS.ProcessEnv = {
    ...environmentBase,
    ...(browser?.env ?? environment),
    VP_RUN_CONCURRENCY_LIMIT: process.env.VP_RUN_CONCURRENCY_LIMIT ?? "2",
    // Browser acceptance always uses a synthetic ingestion host, never a developer project.
    ...(browser
      ? {
          VITE_POSTHOG_PROJECT_TOKEN: "phc_e2e_synthetic",
          VITE_POSTHOG_HOST: "https://analytics.example.test",
        }
      : {}),
    VITE_APP_RELEASE:
      process.env.VITE_APP_RELEASE ||
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    RAYPX_CACHE_PLATFORM: `${process.platform}-${process.arch}-bun${process.versions.bun}`,
  };
  for (const member of model.members.filter(
    (candidate) => (!owner || candidate.name === owner) && candidate.scripts[name],
  )) {
    const key = argumentKey(`${member.name}#${name}`);
    if (forwarded.length) env[key] = JSON.stringify(forwarded);
    else delete env[key];
  }
  await run(
    process.execPath,
    [
      "--bun",
      "vp",
      "run",
      "--fail-if-no-match",
      "--log",
      "labeled",
      ...options,
      filtered ? taskName(name) : reference,
    ],
    root,
    env,
  );
}
