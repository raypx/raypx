import { join, relative } from "node:path";
import { readFileSync } from "node:fs";
import { workspacePatterns } from "@raypx-kit/devkit/workspaces";
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
import { browserTestTasks, type BrowserSurface } from "../browser-tests.ts";
import { taskScripts } from "./delegation.ts";
export { taskRef };
interface TaskMember extends Member {
  native: boolean;
  browserProject?: BrowserSurface;
  uncachedTasks: string[];
}
export type TaskModel = Model<TaskMember>;
function reportDirectories(context: TaskContext<TaskMember>) {
  return workspacePatterns(context.manifest as { workspaces?: unknown })
    .filter((path) => !path.startsWith("!"))
    .flatMap((path) =>
      ["coverage", ".artifacts", "test-results", "playwright-report"].map(
        (directory) => `${path}/${directory}`,
      ),
    );
}
function platform(root: string) {
  const { packageManager } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return `${process.platform}-${process.arch}-${String(packageManager).replace("@", "")}`;
}

function leafCommand(root: string, member: TaskMember, name: string) {
  const file = relative(
    join(root, member.path),
    join(root, "packages/tooling/src/tasks/leaf.ts"),
  ).replaceAll("\\", "/");
  return `tsx ${JSON.stringify(file)} ${JSON.stringify(name)} ${JSON.stringify(platform(root))}`;
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
  const build = name === "build" || name === "build:renderer" || name === "build:e2e";
  if (!build && !["check", "test", "test:unit", "test:component"].includes(name)) return false;
  const exclusions = [
    "**/node_modules/.vitest-cache/**",
    "**/node_modules/.vite/**",
    "**/node_modules/.vite-temp/**",
    "**/node_modules/.cache/**",
    "**/.wrangler/**",
    "**/.tanstack/**",
    ".artifacts/**",
    ...reportDirectories(context).map((directory) => `${directory}/**`),
    // Application CSS excludes browser sources. Ignore their directory enumeration
    // too, so creating a case does not invalidate an unchanged product artifact.
    ...(build && member.browserProject ? [`${member.path}/e2e/**`] : []),
    ...(build || name === "check"
      ? [
          "target/**",
          "**/generated/**",
          "**/resources/bin/**",
          "apps/*/build/**",
          "packages/*/build/**",
          "infra/*/build/**",
          "e2e/build/**",
          "target/**",
          "**/node_modules/.nitro/**",
        ]
      : []),
  ];
  const input: TaskCache["input"] = [
    { auto: true },
    ...(name === "check" ? checkInputs(member, context) : []),
    ...(member.name === "cli" && build
      ? [
          { pattern: "packages/tooling/src/build/*.ts", base: "workspace" as const },
          { pattern: "packages/runtime-node/src/process.ts", base: "workspace" as const },
        ]
      : []),
    ...exclusions
      .flatMap((pattern) => [pattern.slice(0, -3), pattern])
      .map((pattern) => ({ pattern: `!${pattern}`, base: "workspace" as const })),
    { pattern: "!**/.wrangler.*.json", base: "workspace" },
    // Tool caches appear in node_modules after a first run, so a fresh CI runner lists it
    // differently. Dependency changes still reach every task through pnpm-lock.yaml below.
    { pattern: "!**/node_modules", base: "workspace" },
    ...["pnpm-workspace.yaml", "pnpm-lock.yaml"].map((pattern) => ({
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

function validationCache(context: TaskContext<TaskMember>, locales: boolean): TaskCache {
  const patterns = locales
    ? context.members.flatMap((member) => {
        const manifest = JSON.parse(
          readFileSync(join(context.root, member.path, "package.json"), "utf8"),
        );
        const config = manifest.exports?.["./config"];
        return [
          `${member.path}/package.json`,
          `${member.path}/src/messages/*.{ts,json}`,
          ...(typeof config === "string" && config.startsWith("./")
            ? [`${member.path}/${config.slice(2)}`]
            : []),
        ];
      })
    : [
        "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,jsonc,md,toml,yml,yaml}",
        "**/Dockerfile",
        "**/Caddyfile",
        "**/.env.example",
        ".nvmrc",
        ".node-version",
        "rust-toolchain.toml",
        ".tool-versions",
        "**/Cargo.{toml,lock}",
      ];
  return {
    input: [
      { auto: true },
      ...["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ...patterns].map((pattern) => ({
        pattern,
        base: "workspace" as const,
      })),
      ...[
        "**/node_modules",
        "**/node_modules/**",
        ".git",
        ".git/**",
        ".artifacts",
        ".artifacts/**",
        ".agents/**",
        ".claude/**",
        ...reportDirectories(context).flatMap((directory) => [directory, `${directory}/**`]),
      ].map((pattern) => ({ pattern: `!${pattern}`, base: "workspace" as const })),
    ],
    output: [`.artifacts/verification/prechecks/${locales ? "locales" : "policy"}.json`],
    env: ["CI", "LANG", "TZ", "RAYPX_CACHE_PLATFORM"],
    untrackedEnv: ["*"],
  };
}

function dependencyBuilds(member: TaskMember, members: TaskMember[]) {
  return members
    .filter((candidate) => member.dependencies.includes(candidate.name) && candidate.scripts.build)
    .map((candidate) => taskRef(candidate.name, "build"));
}

function browserBuild(member: TaskMember) {
  return member.scripts["build:e2e"]
    ? "build:e2e"
    : member.scripts["build:renderer"]
      ? "build:renderer"
      : "build";
}

function prerequisites(member: TaskMember, name: string, members: TaskMember[]) {
  const result: string[] = [];
  if (name === "build" || name === "build:renderer" || name === "build:e2e" || name === "dev") {
    result.push(...dependencyBuilds(member, members));
    if (name === "build" && member.scripts.check) result.push(taskRef(member.name, "check"));
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
    ["native:prepare", "tauri:smoke"].includes(name) &&
    members.some((candidate) => candidate.name === "cli" && candidate.scripts.build)
  )
    result.push(taskRef("cli", "build"));
  if (member.browserProject && name === "e2e") {
    result.push(taskRef(member.name, browserBuild(member)));
  } else if (browserTestTasks.some((task) => task === name)) {
    const project = name === "e2e:web" ? "web" : name === "e2e:desktop" ? "desktop" : undefined;
    for (const candidate of members)
      if (candidate.browserProject && (!project || candidate.browserProject === project))
        result.push(taskRef(candidate.name, browserBuild(candidate)));
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
        const browserProject = (
          workspace.manifest.raypx as { browserTestProject?: BrowserSurface } | undefined
        )?.browserTestProject;
        if (browserProject && (!["web", "desktop"].includes(browserProject) || !member.scripts.e2e))
          throw new Error(
            `${member.name}: browserTestProject requires web/desktop and an e2e script`,
          );
        return {
          ...member,
          ...(browserProject ? { browserProject } : {}),
          native: Boolean(member.scripts["native:build"] && member.scripts["native:prepare"]),
          uncachedTasks,
        };
      },
      define: (member, name, context) => ({
        command: leafCommand(root, member, name),
        dependsOn: prerequisites(member, name, context.members),
        cache: cachedTask(member, name, context),
      }),
      aggregateCommand: `tsx packages/tooling/src/tasks/leaf.ts --aggregate ${JSON.stringify(platform(root))}`,
      rootTasks: (context) => ({
        // Applications expose local E2E entries, while the root runs one shared Playwright process.
        ...Object.fromEntries(
          browserTestTasks.map((name) => [
            name,
            {
              command: `tsx packages/tooling/src/tasks/leaf.ts --aggregate ${JSON.stringify(platform(root))}`,
              dependsOn: context.members
                .filter((member) => !member.browserProject && member.scripts[name])
                .map((member) => taskRef(member.name, name)),
              cache: false as const,
            },
          ]),
        ),
        policy: {
          command: `tsx packages/tooling/src/cli.ts verify:check policy ${JSON.stringify(platform(root))}`,
          dependsOn: [],
          cache: validationCache(context, false),
        },
        locales: {
          command: `tsx packages/tooling/src/cli.ts verify:check locales ${JSON.stringify(platform(root))}`,
          dependsOn: [],
          cache: validationCache(context, true),
        },
        lint: { command: "vp lint", dependsOn: [], cache: false },
        knip: { command: "pnpm run knip", dependsOn: [], cache: false },
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
