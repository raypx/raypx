import { existsSync, globSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { imports } from "@raypx/devkit/architecture";
import { discover, exportPaths } from "@raypx/devkit/workspaces";
import { opaqueImport, sourceExtensions, toolingSourceClosure } from "../tooling-entries.js";

const testOnly = /(?:^|\/)tests\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** Private gates have no leaf consumers; public helpers follow their actual entry imports. */
export function toolingImpact(root: string) {
  const index = discover(root, { metadataKey: "raypx" });
  const tooling = index.byName.get("@raypx/tooling");
  if (!tooling) return () => ({ global: true, consumers: [] });
  const toolingName = tooling.manifest.name;
  const closure = toolingSourceClosure(index, tooling);
  const consumers = new Map<string, string[]>();
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
        if (!(toolingName in declared)) return false;
        // A script can invoke an exported helper without a source import.
        if (
          Object.values(workspace.manifest.scripts ?? {}).some((script) =>
            requests.some((request) => script.includes(request)),
          )
        )
          return true;
        return globSync(`${workspace.path}/**/*.{${sourceExtensions.join(",")}}`, {
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
          if (opaqueImport.test(source)) return true;
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
    if (!existsSync(join(root, file))) return global;
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
            affected.map(([entry]) => toolingName + (entry === "." ? "" : entry.slice(1))),
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
