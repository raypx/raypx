import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { imports } from "../repo/architecture.js";
import type { Workspace, WorkspaceIndex } from "@raypx/task-graph/workspaces";

/** A public entry nobody imports is dead weight: it still has to compile, test and age. */
interface EntryImporter {
  /** Owning workspace path, or "" for repository-root configuration files. */
  owner: string;
  /** True when the importer only runs under tests (suites, helpers, fixtures, smoke). */
  test: boolean;
}

const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|css)$/;
const TSCONFIG = /(?:^|\/)tsconfig[^/]*\.json$/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_DIRECTORY = /(?:^|\/)(?:tests?|__tests__)\//;
/** Output directories sit at a workspace root; nested names such as `src/build/` are source. */
const OUTPUTS = new Set(["dist", ".output", "generated", "build", "artifacts"]);

/**
 * Walk a directory without descending into dependencies or build output; a glob
 * exclude still traverses node_modules, which dominates the cost on this repository.
 */
function walk(directory: string, prefix: string, files: string[], nested: ReadonlySet<string>) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        (!prefix && OUTPUTS.has(entry.name)) ||
        entry.name.startsWith(".") ||
        nested.has(relative)
      )
        continue;
      walk(join(directory, entry.name), relative, files, nested);
    } else if (SOURCE.test(entry.name) || TSCONFIG.test(entry.name)) files.push(relative);
  }
}

/** CSS reaches a package through @import and Tailwind's @source, not through JS imports. */
function styleRequests(source: string) {
  return [...source.matchAll(/@(?:import|source)\s+(?:url\(|inline\()?["']([^"']+)["']/g)].map(
    (match) => match[1]!,
  );
}

/** A tsconfig names presets through `extends`; read it textually so JSONC still works. */
function tsconfigRequests(source: string) {
  const field = /"extends"\s*:\s*(\[[^\]]*\]|"[^"]*")/.exec(source)?.[1];
  return field ? [...field.matchAll(/"([^"]+)"/g)].map((match) => match[1]!) : [];
}

function requestsFor(file: string, source: string) {
  if (file.endsWith(".css")) return styleRequests(source);
  if (extname(file) === ".json") return tsconfigRequests(source);
  return imports(file, source).map((edge) => edge.request);
}

/** Map a bare request to the workspace and subpath it names. */
function requested(index: WorkspaceIndex, request: string) {
  if (!request.startsWith("@raypx/")) return undefined;
  const base = `@raypx/${request.split("/")[1]}`;
  const workspace = index.byName.get(base);
  return workspace && { workspace, subpath: request.slice(base.length).replace(/^\//, "") };
}

function exemptions(workspace: Workspace): Record<string, string> {
  const value = (workspace.manifest.raypx as { entryConsumers?: unknown } | undefined)
    ?.entryConsumers;
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

/** Node subpath patterns: `*` matches any remainder, including nested segments. */
function entryMatcher(subpath: string) {
  if (!subpath.includes("*")) return (imported: string) => imported === subpath;
  const escaped = subpath.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".+");
  const pattern = new RegExp(`^${escaped}$`);
  return (imported: string) => pattern.test(imported);
}

/** Collect who imports which `@raypx/*` subpath, including repository-root configuration. */
function entryImporters(root: string, index: WorkspaceIndex) {
  const importers = new Map<string, EntryImporter[]>();
  const paths = index.workspaces.map((workspace) => workspace.path);
  // The repository root is scanned too (vite.config.ts, tsconfig.json), minus workspaces.
  for (const owner of [...paths, ""]) {
    const nested = new Set(
      paths
        .filter((path) => path !== owner && (!owner || path.startsWith(`${owner}/`)))
        .map((path) => (owner ? path.slice(owner.length + 1) : path)),
    );
    if (!owner) for (const directory of ["docs", "skills"]) nested.add(directory);
    const directory = owner ? join(root, owner) : root;
    const files: string[] = [];
    walk(directory, "", files, nested);
    // Browser acceptance suites are tests even though their files are not named *.test.
    const acceptance = /(?:^|\/)e2e$/.test(owner);
    for (const file of files) {
      const test = acceptance || TEST_FILE.test(file) || TEST_DIRECTORY.test(file);
      for (const request of requestsFor(file, readFileSync(join(directory, file), "utf8"))) {
        const target = requested(index, request);
        if (!target) continue;
        const key = `${target.workspace.manifest.name}\u0000${target.subpath}`;
        importers.set(key, [...(importers.get(key) ?? []), { owner, test }]);
      }
    }
  }
  return importers;
}

/**
 * Every exports key of a library or tooling workspace needs an importer in another
 * workspace. A test-only consumer keeps `./testing*` entries, tooling workspaces and
 * acceptance workspaces alive; any other library entry needs a production importer.
 */
export function checkEntryConsumers(
  root: string,
  index: WorkspaceIndex,
  importers = entryImporters(root, index),
): string[] {
  const findings: string[] = [];
  for (const workspace of index.workspaces) {
    const kind = workspace.metadata?.kind;
    if (kind !== "library" && kind !== "tooling") continue;
    const declared = workspace.manifest.exports ?? {};
    const exempt = exemptions(workspace);
    // An acceptance workspace exists for the suites that import it.
    const acceptanceSuite = /(?:^|\/)e2e$/.test(workspace.path);

    for (const key of Object.keys(exempt))
      if (!(key in declared))
        findings.push(`${workspace.path}: raypx.entryConsumers names unexported entry "${key}"`);

    for (const entryKey of Object.keys(declared)) {
      if (entryKey in exempt) continue;
      const matches = entryMatcher(entryKey === "." ? "" : entryKey.replace(/^\.\//, ""));
      const consumers = [...importers.entries()]
        .filter(([key]) => {
          const [name, imported] = key.split("\u0000");
          return name === workspace.manifest.name && matches(imported!);
        })
        .flatMap(([, list]) => list)
        .filter((importer) => importer.owner !== workspace.path);
      const testingEntry = /^\.\/testing(?:$|[/.-])/.test(entryKey);
      if (consumers.length === 0)
        findings.push(
          `${workspace.path}: entry "${entryKey}" has no importer in another workspace; remove it or declare raypx.entryConsumers`,
        );
      else if (
        kind !== "tooling" &&
        !testingEntry &&
        !acceptanceSuite &&
        consumers.every((importer) => importer.test)
      )
        findings.push(
          `${workspace.path}: entry "${entryKey}" is imported only by tests; remove it or declare raypx.entryConsumers`,
        );
    }
  }
  return findings;
}
