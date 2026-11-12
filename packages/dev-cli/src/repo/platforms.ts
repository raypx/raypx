import { globSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import {
  exportPaths,
  resolveImport,
  type Target,
  type Workspace,
  type WorkspaceIndex,
} from "@raypx/task-graph/workspaces";

type ReadImports = (file: string) => { request: string; typesOnly: boolean }[];

const extensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
/** Configuration, scripts and acceptance suites beside product source run under Bun. */
const tooling =
  /^(?:(?:.*\/)?[^/]+\.config\.[cm]?[jt]s|\.storybook\/main\.[cm]?[jt]s|(?:scripts|e2e|tests)\/.*|perf\/[^/]+)$/;

/** A file several entries reach must satisfy each of them. */
function combine(reached: ReadonlySet<Target>): Target {
  const [first, ...rest] = reached;
  if (!rest.length) return first!;
  return [...reached].every((target) => target === "node" || target === "bun")
    ? "node"
    : "universal";
}

/**
 * Derives each file's platform instead of declaring it: a file reached from package
 * exports takes the targets of those entries, tooling paths run under Bun and every
 * other file takes the workspace target. Type-only imports do not carry a platform.
 */
export function sourcePlatforms(index: WorkspaceIndex, readImports: ReadImports) {
  const known = new Map<Workspace, Map<string, Set<Target>>>();
  function locate(path: string) {
    const base = path.replace(/\.[cm]?js$/, "");
    return [
      path,
      ...extensions.map((extension) => `${base}.${extension}`),
      ...extensions.map((extension) => `${base}/index.${extension}`),
    ].find((candidate) =>
      statSync(join(index.root, candidate), { throwIfNoEntry: false })?.isFile(),
    );
  }
  function reach(workspace: Workspace) {
    let reached = known.get(workspace);
    if (reached) return reached;
    reached = new Map();
    known.set(workspace, reached);
    for (const [entry, value] of Object.entries(workspace.manifest.exports ?? {})) {
      const target =
        workspace.metadata?.entryTargets?.[entry] ?? workspace.metadata?.target ?? "universal";
      const source = workspace.metadata?.sourceEntries?.[entry];
      const queue = (source ? [source] : exportPaths(value)).flatMap((path) => {
        const exported = posix.join(workspace.path, path);
        return exported.includes("*")
          ? globSync(exported, { cwd: index.root }).map((file) => file.replaceAll("\\", "/"))
          : [exported];
      });
      while (queue.length) {
        const file = locate(queue.pop()!);
        if (!file || !file.startsWith(`${workspace.path}/`)) continue;
        const targets = reached.get(file) ?? new Set<Target>();
        if (targets.has(target)) continue;
        targets.add(target);
        reached.set(file, targets);
        if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
        try {
          for (const { request, typesOnly } of readImports(file)) {
            if (typesOnly) continue;
            const resolved = resolveImport(index, workspace, file, request);
            if (resolved.target === workspace) queue.push(...resolved.paths);
          }
        } catch {
          // Architecture policy reports unparsable sources.
        }
      }
    }
    return reached;
  }
  return (workspace: Workspace, file: string): Target => {
    const reached = reach(workspace).get(file);
    if (reached) return combine(reached);
    if (tooling.test(file.slice(workspace.path.length + 1))) return "bun";
    return workspace.metadata?.target ?? "universal";
  };
}
