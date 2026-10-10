import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "vite-plus";
import {
  configDirectory,
  declaredDependencies,
  exportEntries,
  importTarget,
  workspacePackages,
  workspaceRoot,
} from "./workspace.ts";

const slash = (path: string) => path.replaceAll("\\", "/");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Explicit package specifiers keep server modules out of the browser graph. */
export const serverOnlySpecifierPatterns = [
  /^bun(?:$|:)/,
  /^@raypx\/(?:api|ai|auth|db|storage|logger|worker)(?:\/|$)/,
  /^@raypx\/env\/server(?:\/|$)/,
];

export type WorkspaceCacheInput =
  | string
  | { auto: boolean }
  | { pattern: string; base: "workspace" | "package" };

export function workspaceCacheInputs(importMetaUrl: string | URL): WorkspaceCacheInput[] {
  const directory = configDirectory(importMetaUrl);
  const root = workspaceRoot(directory);
  const packages = workspacePackages(root);
  const current = [...packages.values()].find((entry) => entry.directory === directory);
  if (!current) throw new Error(`No workspace package at ${directory}`);
  const visited = new Set<string>();
  function visit(name: string): void {
    if (visited.has(name)) return;
    const entry = packages.get(name);
    if (!entry) return;
    visited.add(name);
    for (const dependency of Object.keys(declaredDependencies(entry.manifest))) visit(dependency);
  }
  visit(current.manifest.name);
  const inputs: WorkspaceCacheInput[] = [
    { auto: true },
    ...[
      "package.json",
      "bun.lock",
      "bunfig.toml",
      ".bun-version",
      ".node-version",
      "tsconfig*.json",
      "vite.config.*",
    ].map((pattern) => ({
      pattern,
      base: "workspace" as const,
    })),
  ];
  for (const name of visited) {
    const entry = packages.get(name);
    if (!entry) continue;
    const prefix = slash(relative(root, entry.directory));
    for (const suffix of [
      "src/**",
      "migrations/**",
      "drizzle.config.*",
      "test/**",
      "public/**",
      "assets/**",
      "tsconfig/**",
      "package.json",
      "*.json",
      "tsconfig*.json",
      "vite.config.*",
    ]) {
      inputs.push({ pattern: `${prefix}/${suffix}`, base: "workspace" });
    }
  }
  for (const pattern of [
    "!**/dist/**",
    "!**/.output/**",
    "!**/node_modules/**",
    "!**/coverage/**",
    "!**/.tanstack/**",
    "!**/routeTree.gen.ts",
    "!**/*.tsbuildinfo",
  ]) {
    inputs.push({ pattern, base: "workspace" });
  }
  return inputs;
}

export interface SourceAlias {
  find: RegExp;
  replacement: string;
}

export function workspaceSourceAliases(
  root = workspaceRoot(configDirectory(import.meta.url)),
): SourceAlias[] {
  const aliases: SourceAlias[] = [];
  for (const [name, entry] of workspacePackages(root)) {
    if (name === "@raypx/config") continue;
    for (const [subpath, conditions] of exportEntries(entry.manifest)) {
      const target = importTarget(conditions);
      if (!target?.startsWith("./dist/") || subpath.includes("*")) continue;
      const source = resolve(entry.directory, target.replace(/^\.\/dist\//, "./src/"));
      const candidates = /\.[cm]?js$/.test(source)
        ? [source.replace(/\.[cm]?js$/, ".ts"), source.replace(/\.[cm]?js$/, ".tsx"), source]
        : [source];
      const replacement = candidates.find((candidate) => existsSync(candidate));
      if (!replacement) continue;
      const specifier = subpath === "." ? name : `${name}/${subpath.slice(2)}`;
      aliases.push({ find: new RegExp(`^${escapeRegExp(specifier)}$`), replacement });
    }
  }
  return aliases;
}

export interface PackageOptions {
  name: string;
  react?: boolean;
  styles?: boolean;
  test?: boolean;
  dom?: boolean;
}

export function packageConfig(importMetaUrl: string | URL, options: PackageOptions): UserConfig {
  const directory = configDirectory(importMetaUrl);
  const input = workspaceCacheInputs(importMetaUrl);
  const stylesTool = slash(
    relative(directory, fileURLToPath(new URL("./styles.ts", import.meta.url))),
  );
  const build = options.styles ? ["tsc", `bun ${shellQuote(stylesTool)} --copy`] : "tsc";
  const tasks: NonNullable<NonNullable<UserConfig["run"]>["tasks"]> = {
    build: {
      command: build,
      dependsOn: [{ task: "build", from: "dependencies" }],
      cache: { input, output: ["dist/**"] },
    },
    typecheck: {
      command: "tsc --noEmit && tsc -p tsconfig.test.json",
      dependsOn: [{ task: "build", from: "dependencies" }],
      cache: { input, output: [] },
    },
    dev: {
      command: options.styles
        ? `bun ${shellQuote(stylesTool)} --watch`
        : "tsc --watch --preserveWatchOutput",
      cache: false,
    },
  };
  if (options.test) {
    tasks.test = { command: "vp test run", cache: { input, output: [] } };
  }
  return {
    root: directory,
    resolve: { alias: workspaceSourceAliases(workspaceRoot(directory)) },
    test: {
      name: options.name,
      environment: options.dom ? "jsdom" : "node",
      include: options.test
        ? ["test/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"]
        : [],
    },
    run: { tasks },
  };
}
