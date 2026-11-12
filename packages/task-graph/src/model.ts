import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { readFileSync } from "node:fs";
import { workspacePatterns } from "./workspaces.js";
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
} from "./core.js";
import { browserTestTasks, type BrowserSurface } from "./browser-tests.js";
import { taskScripts } from "./delegation.js";
import { taskLifecycleInputs } from "./lifecycle.js";
export { taskRef };
interface TaskMember extends Member {
  native: boolean;
  /** Only workspaces with package exports can reach another workspace's type check. */
  importable: boolean;
  /** Package exports point into `tests/`, so its tests can reach other workspaces. */
  testExports: boolean;
  browserProject?: BrowserSurface;
  delegates: Record<string, string>;
}
export type TaskModel = Model<TaskMember>;
function reportDirectories(context: TaskContext<TaskMember>) {
  return workspacePatterns({ workspaces: context.manifest.workspaces })
    .filter((path) => !path.startsWith("!"))
    .flatMap((path) =>
      ["coverage", ".artifacts", "test-results", "playwright-report"].map(
        (directory) => `${path}/${directory}`,
      ),
    );
}
function platform({ manifest: { packageManager } }: TaskContext<TaskMember>) {
  return `${process.platform}-${process.arch}-${String(packageManager).replace("@", "")}`;
}

function cliRevision(root: string) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "no-git-fixture";
  }
}

const desktopHostTasks = new Set([
  "native:build",
  "check",
  "build",
  "build:renderer",
  "dev",
  "native:smoke",
  "native:smoke:interactive",
  "native:agents",
]);

function scriptCommand(context: TaskContext<TaskMember>, member: TaskMember, name: string) {
  const { root } = context;
  const delegate = member.delegates[name];
  const script =
    !delegate && member.native && desktopHostTasks.has(name)
      ? ["scripts/host/task.ts", "--leaf", name]
      : [delegate ?? name];
  const identity = [`RAYPX_CACHE_PLATFORM=${JSON.stringify(platform(context))}`];
  if (member.name === "cli" && name === "build")
    identity.push(`RAYPX_CLI_CACHE_REVISION=${JSON.stringify(cliRevision(root))}`);
  const bun = `${identity.join(" ")} bun`;
  const runner = script.map((arg) => JSON.stringify(arg)).join(" ");
  const args = process.env[argumentKey(taskRef(member.name, name))];
  // VP CLI arguments belong to one entry task. Related tests and aggregate commands
  // can supply different arguments to each workspace script in the same VP run.
  if (!args || args === "[]") return `${bun} run ${runner}`;
  const adapter = relative(
    join(root, member.path),
    join(root, "packages/task-graph/src/leaf.ts"),
  ).replaceAll("\\", "/");
  return `${bun} ${JSON.stringify(adapter)} ${JSON.stringify(name)} ${runner}`;
}

const checkSources = "*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,jsonc}";

/** Workspace files no other workspace's type check can import. */
export function privateTestInputs(member: Pick<TaskMember, "path" | "testExports">) {
  return [
    ...(member.testExports ? [] : [`${member.path}/tests/**`]),
    `${member.path}/**/*.{test,spec}.${checkSources.slice(2)}`,
    `${member.path}/vite.config.ts`,
    `${member.path}/vitest.config.ts`,
  ];
}

/** True when a changed file can affect only its own workspace's checks and tests. */
export function privateTestFile(member: Pick<TaskMember, "path" | "testExports">, file: string) {
  if (!file.startsWith(`${member.path}/`)) return false;
  const path = file.slice(member.path.length + 1);
  return (
    /^(?:vite|vitest)\.config\.ts$/.test(path) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    (!member.testExports && path.startsWith("tests/"))
  );
}

function checkInputs(member: TaskMember, context: TaskContext<TaskMember>): TaskCache["input"] {
  const dependencies = context
    .dependencyClosure(member)
    .filter((candidate) => candidate === member || candidate.importable);
  return [
    { pattern: "tsconfig*.json", base: "workspace" },
    ...dependencies.map((candidate) => ({
      pattern: `${candidate.path}/**/${checkSources}`,
      base: "workspace" as const,
    })),
    // A dependency's tests and VP/Vitest configs never reach this type check.
    ...dependencies
      .filter((candidate) => candidate !== member)
      .flatMap(privateTestInputs)
      .map((pattern) => ({ pattern: `!${pattern}`, base: "workspace" as const })),
  ];
}
function cachedTask(
  member: TaskMember,
  name: string,
  context: TaskContext<TaskMember>,
): TaskCache | false {
  const build = name === "build" || name === "build:renderer" || name === "build:e2e";
  if (!build && !["check", "test", "test:unit", "test:component"].includes(name)) return false;
  const lifecycleApi =
    name === "test" && member.name === "cli"
      ? context.members.find((candidate) => candidate.name === "api")
      : undefined;
  const exclusions = [
    "**/node_modules/.vitest-cache/**",
    "**/node_modules/.vite/**",
    "**/node_modules/.vite-temp/**",
    "**/node_modules/.cache/**",
    "**/.wrangler/**",
    "**/.tanstack/**",
    ".artifacts/**",
    // Downloads are verified against the CLI manifest and copied into dist.
    // A fresh runner can restore that complete output without a download cache.
    ...(build && member.name === "cli" ? [".cache/herdr/**"] : []),
    ...reportDirectories(context).map((directory) => `${directory}/**`),
    // Application CSS excludes browser sources. Ignore their directory enumeration
    // too, so creating a case does not invalidate an unchanged product artifact.
    ...(build && member.browserProject ? [`${member.path}/e2e/**`] : []),
    ...(build || name === "check"
      ? [
          "target/**",
          "**/generated/**",
          "**/resources/bin/**",
          ...context
            .dependencyClosure(member)
            .filter((candidate) => candidate.native)
            .map((candidate) => `${candidate.path}/build/**`),
          ...(member.native ? [`${member.path}/build/**`] : []),
          "**/.mygo/**",
          "**/node_modules/.nitro/**",
        ]
      : []),
  ];
  const input: TaskCache["input"] = [
    { auto: true },
    "package.json",
    ...(lifecycleApi
      ? taskLifecycleInputs(lifecycleApi.path).map((pattern) => ({
          pattern,
          base: "workspace" as const,
        }))
      : []),
    ...(name === "check" || (member.name === "cli" && build) ? checkInputs(member, context) : []),
    ...(member.name === "cli" && build
      ? [
          { pattern: "packages/tooling/src/build/*.ts", base: "workspace" as const },
          { pattern: "packages/runtime-node/src/process.ts", base: "workspace" as const },
        ]
      : []),
    ...exclusions
      .flatMap((pattern) => [pattern.slice(0, -3), pattern])
      .map((pattern) => ({ pattern: `!${pattern}`, base: "workspace" as const })),
    // Windows also traces the parent listing when staging a Herdr download.
    ...(member.name === "cli" && build ? [{ pattern: "!.cache", base: "workspace" as const }] : []),
    { pattern: "!**/.wrangler.*.json", base: "workspace" },
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
    "RAYPX_CLI_PAYLOAD",
    argumentKey(`${member.name}#${name}`),
  ];
  if (build && member.name === "cli") env.push("SOURCE_DATE_EPOCH", "BUN_*", "RAYPX_HERDR_*");
  if (build && member.name !== "cli")
    env.push("VITE_*", "EXPO_PUBLIC_*", "NITRO_PRESET", "RAYPX_SOURCEMAPS");
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
          `${member.path}/locales/**/*.{ts,json}`,
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
        ".bun-version",
        ".tool-versions",
        "**/go.{mod,sum}",
      ];
  return {
    input: [
      { auto: true },
      ...["package.json", "bun.lock", "bunfig.toml", ...patterns].map((pattern) => ({
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

/** The root project checks every workspace's VP and Vitest configuration under Node. */
function rootTypesCache(context: TaskContext<TaskMember>): TaskCache {
  return {
    input: [
      { auto: true },
      ...[
        "package.json",
        "bun.lock",
        "tsconfig.json",
        "vite.config.ts",
        "test.config.ts",
        "test.dom.ts",
        "deploy/*.ts",
        ...context.members.flatMap((member) => [
          `${member.path}/package.json`,
          `${member.path}/vite.config.ts`,
          `${member.path}/vitest.config.ts`,
        ]),
        ...context.members
          .filter((member) => member.importable)
          .map((member) => `${member.path}/**/${checkSources}`),
      ].map((pattern) => ({ pattern, base: "workspace" as const })),
      ...["**/node_modules/**", ".artifacts/**"].map((pattern) => ({
        pattern: `!${pattern}`,
        base: "workspace" as const,
      })),
    ],
    output: [],
    env: ["RAYPX_CACHE_PLATFORM"],
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
    ["native:build", "native:smoke", "native:smoke:interactive", "native:agents"].includes(name)
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
  if (member.browserProject && name === "e2e") {
    result.push(taskRef(member.name, browserBuild(member)));
  } else if (browserTestTasks.some((task) => task === name)) {
    const project = name === "e2e:web" ? "web" : name === "e2e:desktop" ? "desktop" : undefined;
    for (const candidate of members)
      if (candidate.browserProject && (!project || candidate.browserProject === project))
        result.push(taskRef(candidate.name, browserBuild(candidate)));
  }

  return [...new Set(result)].filter(
    (task) => !(process.env.RAYPX_CLI_PAYLOAD && task === taskRef("cli", "build")),
  );
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
        const delegates = taskScripts(workspace.manifest);
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
          importable: Boolean(workspace.manifest.exports),
          testExports: JSON.stringify(workspace.manifest.exports ?? {}).includes("./tests/"),
          delegates,
        };
      },
      define(member, name, context) {
        let cache: TaskCache | false | undefined;
        return {
          command: scriptCommand(context, member, name),
          dependsOn: prerequisites(member, name, context.members),
          // Config loading emits one owner's tasks. Build input lists only when read.
          get cache() {
            return (cache ??= cachedTask(member, name, context));
          },
        };
      },
      // VP can schedule an aggregate with dependencies and no command to spawn.
      aggregateCommand: "",
      rootTasks: (context) => ({
        // Applications expose local E2E entries, while the root runs one shared Playwright process.
        ...Object.fromEntries(
          browserTestTasks.map((name) => [
            name,
            {
              command: "",
              dependsOn: context.members
                .filter((member) => !member.browserProject && member.scripts[name])
                .map((member) => taskRef(member.name, name)),
              cache: false as const,
            },
          ]),
        ),
        policy: {
          command: `bun packages/dev-cli/src/cli.ts verify:check policy ${JSON.stringify(platform(context))}`,
          dependsOn: [],
          cache: validationCache(context, false),
        },
        locales: {
          command: `bun packages/dev-cli/src/cli.ts verify:check locales ${JSON.stringify(platform(context))}`,
          dependsOn: [],
          cache: validationCache(context, true),
        },
        // Workspace configs run under Node; their own presets may lack Node types.
        types: {
          command: `RAYPX_CACHE_PLATFORM=${JSON.stringify(platform(context))} tsc --noEmit --project tsconfig.json`,
          dependsOn: [],
          cache: rootTypesCache(context),
        },
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
