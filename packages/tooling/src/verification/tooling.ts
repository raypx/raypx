import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { imports } from "@raypx-kit/devkit/architecture";
import { discover, exportPaths, resolveImport } from "@raypx-kit/devkit/workspaces";

const extensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
const testOnly = /(?:^|\/)tests\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const opaque = /\b(?:import|require)\s*\(\s*(?:(?!\s*["'`])|`[^`]*\$\{)/;

/** Private gates have no leaf consumers; public helpers follow their actual entry imports. */
export function toolingImpact(root: string) {
  const index = discover(root, { metadataKey: "raypx" });
  const tooling = index.byName.get("@raypx/tooling");
  const closures = new Map<string, Set<string>>();
  const consumers = new Map<string, string[]>();
  function locate(path: string) {
    const base = path.replace(/\.[cm]?js$/, "");
    const file = [
      path,
      ...extensions.map((ext) => `${base}.${ext}`),
      ...extensions.map((ext) => `${base}/index.${ext}`),
    ].find(
      (candidate) => existsSync(join(root, candidate)) && statSync(join(root, candidate)).isFile(),
    );
    if (!file) throw new Error(`Unresolved Tooling input: ${path}`);
    return file;
  }
  function closure(entry: string) {
    const known = closures.get(entry);
    if (known) return known;
    const seen = new Set<string>(),
      queue = [entry];
    while (queue.length) {
      const file = locate(queue.pop()!);
      if (seen.has(file)) continue;
      seen.add(file);
      if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
      const source = readFileSync(join(root, file), "utf8");
      if (opaque.test(source)) throw new Error(`Computed Tooling import: ${file}`);
      for (const { request } of imports(file, source)) {
        const resolved = resolveImport(index, tooling!, file, request);
        if (resolved.target === tooling) queue.push(...resolved.paths);
      }
    }
    closures.set(entry, seen);
    return seen;
  }
  function entryConsumers(requests: string[]) {
    const key = requests.join("\n"),
      known = consumers.get(key);
    if (known) return known;
    const result = index.workspaces
      .filter((workspace) => {
        if (workspace === tooling) return false;
        const declared = {
          ...workspace.manifest.dependencies,
          ...workspace.manifest.devDependencies,
        };
        if (!(tooling!.manifest.name in declared)) return false;
        // A script can invoke an exported helper without a source import.
        if (
          Object.values(workspace.manifest.scripts ?? {}).some((script) =>
            requests.some((request) => script.includes(request)),
          )
        )
          return true;
        return globSync(`${workspace.path}/**/*.{${extensions.join(",")}}`, {
          cwd: root,
          exclude: [
            "**/node_modules/**",
            ...["dist", ".output", "build", "artifacts", "coverage"].map(
              (directory) => `${workspace.path}/${directory}/**`,
            ),
          ],
        }).some((file) => {
          const source = readFileSync(join(root, file), "utf8");
          // Unresolved dynamic consumers retain their complete checks.
          if (opaque.test(source)) return true;
          try {
            return imports(file, source).some(({ request }) => requests.includes(request));
          } catch {
            return true;
          }
        });
      })
      .map((workspace) => workspace.manifest.name);
    consumers.set(key, result);
    return result;
  }
  return (file: string): { global: boolean; consumers: string[] } => {
    const global = { global: true, consumers: [] };
    if (!tooling || !existsSync(join(root, file))) return global;
    const relative = posix.relative(tooling.path, file);
    if (testOnly.test(relative)) return { global: false, consumers: [] };
    if (/^(?:src\/tasks\/|src\/(?:cli|repository)\.ts$)/.test(relative)) return global;
    try {
      const entries = Object.entries(tooling.manifest.exports ?? {});
      const affected = entries.filter(([, value]) =>
        exportPaths(value).some((entry) => {
          if (entry.includes("*")) throw new Error("Wildcard Tooling export");
          return closure(posix.join(tooling.path, entry)).has(file);
        }),
      );
      if (affected.some(([entry]) => entry === "./tasks")) return global;
      if (affected.length)
        return {
          global: false,
          consumers: entryConsumers(
            affected.map(
              ([entry]) => tooling.manifest.name + (entry === "." ? "" : entry.slice(1)),
            ),
          ),
        };
      if (/^src\/(?:verification\/|validation\/|policy(?:\.|\/))/.test(relative))
        return { global: false, consumers: [] };
      return global;
    } catch {
      return global;
    }
  };
}
