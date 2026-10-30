import { join, relative } from "node:path";
import { readFileSync } from "node:fs";
import {
  createTaskModel,
  argumentKey,
  taskPlan as sharedPlan,
  taskRef,
  taskSelection,
  type TaskMember as Member,
  type TaskModel as Model,
  type TaskContext,
  type TaskCache,
} from "@raypx-kit/devkit/tasks";
import { taskScripts } from "./delegation.js";
export { taskRef };
interface TaskMember extends Member {
  native: boolean;
  uncachedTasks: string[];
}
export type TaskModel = Model<TaskMember>;
function platform(root: string) {
  const { packageManager } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return `${process.platform}-${process.arch}-${String(packageManager).replace("@", "")}`;
}

function leafCommand(root: string, member: TaskMember, name: string) {
  const file = relative(
    join(root, member.path),
    join(root, "packages/tooling/src/tasks/leaf.ts"),
  ).replaceAll("\\", "/");
  return `bun ${JSON.stringify(file)} ${JSON.stringify(name)} ${JSON.stringify(platform(root))}`;
}

function checkInputs(member: TaskMember, context: TaskContext<TaskMember>): TaskCache["input"] {
  return [
    { pattern: "tsconfig*.json", base: "workspace" },
    ...context.dependencyClosure(member).map((candidate) => ({
      pattern: `${candidate.path}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,jsonc}`,
      base: "workspace" as const,
    })),
  ];
}
function cachedTask(
  member: TaskMember,
  name: string,
  context: TaskContext<TaskMember>,
): TaskCache | false {
  if (member.uncachedTasks.includes(name)) return false;
  const build = name === "build" || name === "build:renderer";
  if (!build && !["check", "test", "test:unit", "test:component"].includes(name)) return false;
  const exclusions = [
    "**/node_modules/.vitest-cache/**",
    "**/node_modules/.vite/**",
    "**/node_modules/.vite-temp/**",
    "**/node_modules/.cache/**",
    "**/.tanstack/**",
    ".artifacts/**",
    ...(build || name === "check"
      ? [
          "target/**",
          "**/generated/**",
          "**/resources/bin/**",
          "**/build/**",
          "**/.mygo/**",
          "**/node_modules/.nitro/**",
        ]
      : []),
  ];
  const input: TaskCache["input"] = [
    { auto: true },
    ...(name === "check" ? checkInputs(member, context) : []),
    ...exclusions
      .flatMap((pattern) => [pattern.slice(0, -3), pattern])
      .map((pattern) => ({ pattern: `!${pattern}`, base: "workspace" as const })),
    // Tool caches appear in node_modules after a first run, so a fresh CI runner lists it
    // differently. Dependency changes still reach every task through bun.lock below.
    { pattern: "!**/node_modules", base: "workspace" },
    ...["bunfig.toml", "bun.lock"].map((pattern) => ({
      pattern,
      base: "workspace" as const,
    })),
    ...["dist", ".output", "artifacts", "coverage"].flatMap((directory) => [
      `!${directory}`,
      `!${directory}/**`,
    ]),
  ];
  if (member.native && name === "check")
    for (const directory of ["artifacts"])
      input.push(
        { pattern: `!${member.path}/${directory}`, base: "workspace" },
        { pattern: `!${member.path}/${directory}/**`, base: "workspace" },
      );
  const env = [
    "NODE_ENV",
    "CI",
    "LANG",
    "TZ",
    "RAYPX_CACHE_PLATFORM",
    argumentKey(`${member.name}#${name}`),
  ];
  if (build && member.name !== "cli") env.push("VITE_*", "NITRO_PRESET", "RAYPX_SOURCEMAPS");
  if (member.native && ["check", "build", "build:renderer"].includes(name)) {
    const category =
      name === "build:renderer" ? "RENDERER" : name.toUpperCase().replaceAll(":", "_");
    env.push(`RAYPX_DESKTOP_${category}_ARGS`);
  }
  if (member.native && build) env.push("RAYPX_DESKTOP_BROWSER_BUILD");
  return {
    env,
    // Match the existing environment contract; explicitly tracked patterns win.
    untrackedEnv: ["*"],
    input,
    output:
      name === "build:renderer" ? ["artifacts/browser/**"] : build ? ["dist/**", ".output/**"] : [],
  };
}

function dependencyBuilds(member: TaskMember, members: TaskMember[]) {
  return members
    .filter((candidate) => member.dependencies.includes(candidate.name) && candidate.scripts.build)
    .map((candidate) => taskRef(candidate.name, "build"));
}

function prerequisites(member: TaskMember, name: string, members: TaskMember[]) {
  const result: string[] = [];
  if (name === "build" || name === "build:renderer" || name === "dev") {
    result.push(...dependencyBuilds(member, members));
    if (name !== "dev" && name !== "build:renderer" && member.scripts.check)
      result.push(taskRef(member.name, "check"));
    if (member.native && name === "dev") {
      if (members.some((candidate) => candidate.name === "cli" && candidate.scripts.build))
        result.push(taskRef("cli", "build"));
    }
  }
  if (
    member.native &&
    [
      "native:build",
      "native:smoke",
      "native:smoke:interactive",
      "native:beta",
      "native:agents",
    ].includes(name)
  ) {
    if (member.scripts.build) result.push(taskRef(member.name, "build"));
    if (members.some((candidate) => candidate.name === "cli" && candidate.scripts.build))
      result.push(taskRef("cli", "build"));
  }
  if (
    member.native &&
    ["native:prepare", "mygo:smoke"].includes(name) &&
    members.some((candidate) => candidate.name === "cli" && candidate.scripts.build)
  )
    result.push(taskRef("cli", "build"));
  if (["e2e", "e2e:web", "e2e:desktop", "e2e:smoke", "e2e:visual"].includes(name)) {
    if (name !== "e2e:desktop") result.push(taskRef("web", "build"));
    if (name !== "e2e:web") result.push(taskRef("desktop", "build:renderer"));
  }
  return [...new Set(result)];
}

export function taskModel(
  root: string,
  selection = taskSelection(root, "RAYPX_VERIFY_TASKS", "RAYPX_VERIFY_ROOT"),
): TaskModel {
  return createTaskModel<TaskMember>(
    root,
    {
      discovery: { metadataKey: "raypx" },
      member(workspace, member) {
        taskScripts(workspace.manifest);
        const uncachedTasks =
          (workspace.manifest.raypx as { uncachedTasks?: string[] } | undefined)?.uncachedTasks ??
          [];
        if (uncachedTasks.some((name) => !member.scripts[name]))
          throw new Error(`${member.name}: uncachedTasks must name existing scripts`);
        return {
          ...member,
          native: Boolean(member.scripts["native:build"] && member.scripts["native:prepare"]),
          uncachedTasks,
        };
      },
      define: (member, name, context) => ({
        command: leafCommand(root, member, name),
        dependsOn: prerequisites(member, name, context.members),
        cache: cachedTask(member, name, context),
      }),
      aggregateCommand: `bun packages/tooling/src/tasks/leaf.ts --aggregate ${JSON.stringify(platform(root))}`,
      rootTasks: () => ({
        lint: { command: "bun --bun vp lint", dependsOn: [], cache: false },
        knip: { command: "bun run knip", dependsOn: [], cache: false },
      }),
    },
    selection,
  );
}
export function taskPlan(model: TaskModel, references: string[]) {
  return sharedPlan(model, references, "task-first").map(({ ref, ...definition }) => ({
    taskId: ref.replace("#task:", "#"),
    vpTaskId: ref,
    ...definition,
  }));
}
