import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { imports } from "./repo/architecture.js";
import { resolveImport, type Workspace, type WorkspaceIndex } from "./repo/workspaces.js";

export const sourceExtensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
export const opaqueImport = /\bimport\s*\(\s*(?!\s*["'])|\brequire\s*\(|^\s*\/\/\/\s*<reference\b/m;

export function toolingSourceClosure(index: WorkspaceIndex, tooling: Workspace) {
  const closures = new Map<string, Set<string>>();

  function locate(path: string) {
    const base = path.replace(/\.[cm]?js$/, "");
    const files = [
      ...new Set([
        path,
        ...sourceExtensions.map((ext) => `${base}.${ext}`),
        ...sourceExtensions.map((ext) => `${base}/index.${ext}`),
      ]),
    ].filter(
      (candidate) =>
        existsSync(join(index.root, candidate)) && statSync(join(index.root, candidate)).isFile(),
    );
    if (files.length !== 1) throw new Error(`Unresolved Tooling input: ${path}`);
    return files[0]!;
  }

  return (entry: string) => {
    const known = closures.get(entry);
    if (known) return known;
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length) {
      const file = locate(queue.pop()!);
      if (seen.has(file)) continue;
      seen.add(file);
      if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
      const source = readFileSync(join(index.root, file), "utf8");
      if (opaqueImport.test(source)) throw new Error(`Opaque Tooling import: ${file}`);
      for (const { request } of imports(file, source)) {
        const resolved = resolveImport(index, tooling, file, request);
        if (resolved.target === tooling && resolved.paths.length) {
          queue.push(...resolved.paths);
        } else if (resolved.internalPath || /^[.#/]/.test(request)) {
          throw new Error(`Unresolved Tooling import in ${file}: ${request}`);
        }
      }
    }
    closures.set(entry, seen);
    return seen;
  };
}
