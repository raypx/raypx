import { globSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { imports } from "@raypx-kit/devkit/architecture";
import type { WorkspaceIndex } from "@raypx-kit/devkit/workspaces";

export interface SourceNode {
  path: string;
  dependencies: string[];
  requests: string[];
}
function layer(path: string) {
  if (path.startsWith("packages/contracts/src/")) return "contracts";
  if (path.includes("/agents/domain/")) return "orchestration-domain";
  if (path.includes("/application/")) return "application";
  if (path.includes("/src/model/")) return "model";
  if (path.includes("/server/rpc/")) return "rpc";
  if (path.includes("/infrastructure/")) return "adapter";
  return undefined;
}
function forbidden(owner: string, target: string, request: string) {
  // Contracts are wire-only: no presentation or platform-server surface, plus the
  // infrastructure rule below that every layered owner shares.
  if (
    owner === "contracts" &&
    (/^react(?:-dom)?(?:\/|$)/.test(request) ||
      /^@raypx\/(?:ui|i18n|icons|client|auth)(?:\/|$)/.test(request) ||
      /^@raypx\/[^/]+\/(?:server|client|crypto)(?:\/|$)/.test(request))
  )
    return true;
  // The Agent orchestration domain is pure: Core schemas, zod and its own files
  // only. A relative import stays legal while it resolves inside the domain or
  // inside an allowed package's own source (Core's internal modules).
  if (owner === "orchestration-domain") {
    if (/^@raypx\/core(?:\/|$)/.test(request) || /^zod(?:\/|$)/.test(request)) return false;
    if (/^\.{1,2}\//.test(request))
      return Boolean(target) && !/\/agents\/domain\/|^packages\/core\//.test(target);
    return true;
  }
  if (owner === "rpc" && /\/server\/api\.[jt]s$/.test(target)) return true;
  if (owner === "adapter") return /\/runtime\/index\.[cm]?[jt]s$/.test(target);
  const infrastructure =
    /\/(?:infrastructure|sqlite)\//.test(target) ||
    /^(?:bun:sqlite|node:(?:fs(?:\/|$)|child_process|sqlite)|drizzle-orm(?:\/|$)|@raypx\/(?:database|providers\/(?:codex|claude|pi))(?:\/|$))/.test(
      request,
    );
  return (
    infrastructure ||
    (owner === "model" &&
      /^(?:react(?:\/|$)|react-dom(?:\/|$)|@raypx\/(?:ui|client)(?:\/|$))/.test(request))
  );
}
/** Follow re-exports and imports transitively; a barrel must not bypass a layer. */
export function layerViolations(nodes: ReadonlyMap<string, SourceNode>) {
  const findings: string[] = [];
  for (const origin of nodes.values()) {
    const owner = layer(origin.path);
    if (!owner) continue;
    const visited = new Set<string>();
    const visit = (node: SourceNode): boolean => {
      if (visited.has(node.path)) return false;
      visited.add(node.path);
      for (let i = 0; i < node.requests.length; i++) {
        const target = node.dependencies[i] ?? "";
        if (forbidden(owner, target, node.requests[i]!)) {
          findings.push(
            origin.path +
              ": " +
              owner +
              " reaches forbidden dependency " +
              node.requests[i] +
              " through " +
              node.path,
          );
          return true;
        }
        const child = nodes.get(target);
        if (child && visit(child)) return true;
      }
      return false;
    };
    visit(origin);
  }
  return findings;
}
export function checkSourceLayers(root: string, index: WorkspaceIndex) {
  const nodes = new Map<string, SourceNode>();
  for (const workspace of index.workspaces) {
    for (const file of globSync("**/*.{ts,tsx}", {
      cwd: resolve(root, workspace.path),
      exclude: [
        "node_modules/**",
        "dist/**",
        ".output/**",
        "tests/**",
        "**/*.test.*",
        "**/routeTree.gen.ts",
      ],
    })) {
      const full = resolve(root, workspace.path, file);
      const path = relative(root, full).replaceAll("\\", "/");
      const edges = imports(path, readFileSync(full, "utf8"));
      const dependencies = edges.map(({ request }) => {
        try {
          return relative(root, realpathSync(Bun.resolveSync(request, dirname(full)))).replaceAll(
            "\\",
            "/",
          );
        } catch {
          return "";
        } // Existing workspace policy reports unresolved/private imports.
      });
      nodes.set(path, { path, dependencies, requests: edges.map((edge) => edge.request) });
    }
  }
  return layerViolations(nodes);
}
