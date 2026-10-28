import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { discover } from "@raypx-kit/devkit/workspaces";
import { argumentKey } from "./arguments.js";
import { taskScripts } from "./delegation.js";
export { argumentKey } from "./arguments.js";

export interface TaskCache {
  env: string[];
  untrackedEnv: string[];
  input: (string | { auto: boolean } | { pattern: string; base: "workspace" })[];
  output: string[];
}
export interface TaskDefinition {
  command: string;
  dependsOn: string[];
  cache: false | TaskCache;
}
export interface TaskMember {
  name: string;
  path: string;
  scripts: Record<string, string>;
  dependencies: string[];
  native: boolean;
  uncachedTasks: string[];
}
export interface TaskModel {
  root: string;
  rootName: string;
  members: TaskMember[];
  definitions: Map<string, TaskDefinition>;
}

export const taskName = (name: string) => `task:${name}`;
export const taskRef = (member: string, name: string) => `${member}#${taskName(name)}`;

export function repositoryRoot(directory: string): string {
  let candidate = resolve(directory);
  while (true) {
    const manifest = join(candidate, "package.json");
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).workspaces)
      return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error("Task config needs a workspace repository");
    candidate = parent;
  }
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
  return `bun ${JSON.stringify(file)} ${JSON.stringify(name)} ${JSON.stringify(platform(root))}`;
}

function checkInputs(member: TaskMember, members: TaskMember[]): TaskCache["input"] {
  const inputs = new Set<TaskMember>();
  const byName = new Map(members.map((candidate) => [candidate.name, candidate]));
  function visit(candidate: TaskMember) {
    if (inputs.has(candidate)) return;
    inputs.add(candidate);
    for (const name of candidate.dependencies) {
      const dependency = byName.get(name);
      if (dependency) visit(dependency);
    }
  }
  visit(member);
  // Bun's native typechecker reads are not fully traced on Linux. Include the
  // workspace dependency closure explicitly, including dependency declarations.
  return [
    { pattern: "tsconfig*.json", base: "workspace" },
    ...[...inputs].map((candidate) => ({
      pattern: `${candidate.path}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,jsonc}`,
      base: "workspace" as const,
    })),
  ];
}

function cachedTask(member: TaskMember, name: string, members: TaskMember[]): TaskCache | false {
  if (member.uncachedTasks.includes(name)) return false;
  const build = name === "build" || name === "build:renderer";
  if (!build && !["check", "test", "test:unit", "test:component"].includes(name)) return false;
  const exclusions = [
    "**/node_modules/.vitest-cache/**",
    "**/node_modules/.vite/**",
    "**/node_modules/.vite-temp/**",
    "**/.tanstack/**",
    ".artifacts/**",
  ];
  const input: TaskCache["input"] = [
    { auto: true },
    ...(name === "check" ? checkInputs(member, members) : []),
    ...exclusions
      .flatMap((pattern) => [pattern.slice(0, -3), pattern])
      .map((pattern) => ({ pattern: `!${pattern}`, base: "workspace" as const })),
    ...["bunfig.toml", "bun.lock"].map((pattern) => ({
      pattern,
      base: "workspace" as const,
    })),
    ...["dist", ".output", "artifacts/browser", "coverage"].flatMap((directory) => [
      `!${directory}`,
      `!${directory}/**`,
    ]),
  ];
  if (member.native && name === "check")
    for (const directory of ["artifacts/browser"])
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
  if (build) env.push("VITE_*", "NITRO_PRESET", "RAYPX_SOURCEMAPS");
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
    name === "tauri:cli" &&
    members.some((candidate) => candidate.name === "cli" && candidate.scripts.build)
  )
    result.push(taskRef("cli", "build"));
  if (["e2e", "e2e:web", "e2e:desktop", "e2e:smoke", "e2e:visual"].includes(name)) {
    if (name !== "e2e:desktop") result.push(taskRef("web", "build"));
    if (name !== "e2e:web") result.push(taskRef("desktop", "build:renderer"));
  }
  return [...new Set(result)];
}

/** Data only: VP owns scheduling, caching and dependency execution. */
export function taskModel(root: string): TaskModel {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const index = discover(root, { metadataKey: "raypx" });
  if (index.findings.length) throw new Error(index.findings.join("\n"));
  const members: TaskMember[] = index.workspaces.map((workspace) => ({
    name: workspace.manifest.name,
    path: workspace.path,
    scripts: workspace.manifest.scripts ?? {},
    dependencies: [
      ...new Set([
        ...Object.keys(workspace.manifest.dependencies ?? {}),
        ...Object.keys(workspace.manifest.devDependencies ?? {}),
      ]),
    ],
    native: Boolean(
      workspace.manifest.scripts?.["native:build"] && workspace.manifest.scripts?.["tauri:cli"],
    ),
    uncachedTasks:
      (workspace.manifest.raypx as { uncachedTasks?: string[] } | undefined)?.uncachedTasks ?? [],
  }));
  const definitions = new Map<string, TaskDefinition>();
  for (const member of members) {
    taskScripts(index.byName.get(member.name)!.manifest);
    if (member.uncachedTasks.some((name) => !member.scripts[name]))
      throw new Error(`${member.name}: uncachedTasks must name existing scripts`);
    for (const name of Object.keys(member.scripts)) {
      definitions.set(taskRef(member.name, name), {
        command: leafCommand(root, member, name),
        dependsOn: prerequisites(member, name, members),
        cache: cachedTask(member, name, members),
      });
    }
  }
  const aggregate = (name: string, dependsOn: string[]) =>
    definitions.set(taskRef(manifest.name, name), {
      command: `bun packages/tooling/src/tasks/leaf.ts --aggregate ${JSON.stringify(platform(root))}`,
      dependsOn,
      cache: false,
    });
  // Cargo owns Rust's incremental state. Keep it outside VP's filesystem tracer.
  const rust = existsSync(join(root, "Cargo.toml"));
  if (rust) {
    // Linux library CI has no WebKitGTK development packages. The Desktop
    // application has its own macOS/Windows checks and packaged smoke gates.
    const exclude =
      process.platform === "linux" && existsSync(join(root, "apps/desktop/src-tauri/Cargo.toml"))
        ? " --exclude raypx-desktop"
        : "";
    const desktop = members.find(
      (member) =>
        member.native &&
        member.scripts["tauri:generate"] &&
        existsSync(join(root, member.path, "src-tauri/Cargo.toml")),
    );
    const prepare =
      desktop && process.platform !== "linux"
        ? [taskRef(desktop.name, "tauri:generate"), taskRef(desktop.name, "tauri:cli")]
        : [];
    const commands = {
      build: `cargo build --workspace${exclude} --all-targets --locked`,
      check: `cargo check --workspace${exclude} --all-targets --locked`,
      test: `cargo test --workspace${exclude} --locked`,
      lint: `cargo clippy --workspace${exclude} --all-targets --locked -- -D warnings`,
      format: "cargo fmt --all -- --check",
    };
    for (const [name, command] of Object.entries(commands))
      definitions.set(taskRef(manifest.name, `rust:${name}`), {
        command,
        dependsOn: name === "format" ? [] : prepare,
        cache: false,
      });
    aggregate(
      "rust:verify",
      Object.keys(commands).map((name) => taskRef(manifest.name, `rust:${name}`)),
    );
  }
  const names = new Set(members.flatMap((member) => Object.keys(member.scripts)));
  for (const name of names)
    aggregate(
      name,
      members.filter((member) => member.scripts[name]).map((member) => taskRef(member.name, name)),
    );
  definitions.set(taskRef(manifest.name, "lint"), {
    command: "bun --bun vp lint",
    dependsOn: [],
    cache: false,
  });
  for (const name of ["verify", "verify:quick"])
    aggregate(
      name,
      ["check", "test", ...(name === "verify" ? ["build"] : []), "lint"]
        .filter((task) => definitions.has(taskRef(manifest.name, task)))
        .map((task) => taskRef(manifest.name, task)),
    );
  return { root, rootName: manifest.name, members, definitions };
}

export function taskPlan(model: TaskModel, references: string[]) {
  const found = new Map<string, TaskDefinition>();
  function visit(reference: string) {
    if (found.has(reference)) return;
    const definition = model.definitions.get(reference);
    if (!definition) throw new Error(`Unknown VP task: ${reference}`);
    found.set(reference, definition);
    for (const dependency of definition.dependsOn) visit(dependency);
  }
  for (const reference of references) visit(reference);
  return [...found].map(([reference, definition]) => ({
    taskId: reference.replace("#task:", "#"),
    vpTaskId: reference,
    ...definition,
  }));
}
