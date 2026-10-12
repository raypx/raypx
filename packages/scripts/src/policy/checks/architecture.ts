import { dirname, join, posix } from "node:path";
import { parseSync, visitorKeys, type Node } from "oxc-parser";
import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { findingFor } from "../findings.js";

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  imports?: Record<string, string>;
}
interface Workspace {
  path: string;
  manifest: Manifest;
}
const report = findingFor("architecture.boundary");
const packageRules: Record<string, readonly string[]> = {
  shared: [],
  tsconfig: [],
  auth: ["shared"],
  core: ["auth", "shared"],
  db: ["core", "shared"],
  application: ["core"],
  ai: ["application", "core", "shared"],
  mail: ["i18n", "shared"],
  cache: ["shared"],
  storage: ["core", "shared"],
  client: ["contracts", "shared"],
  contracts: [],
  i18n: ["shared"],
  ui: ["i18n", "shared"],
  "agent-ui": ["ui", "contracts", "i18n", "shared"],
};
const rendererPackages = ["client", "contracts", "i18n", "ui", "agent-ui", "shared", "tsconfig"];
function allowed(from: Workspace, to: Workspace, file?: string) {
  if (to.path.startsWith("apps/")) return false;
  if (from.manifest.name === "@voidmix/scripts" || from.path === "e2e") return true;
  if (to.manifest.name === "@voidmix/scripts") return false;
  if (from.path === "apps/desktop") {
    const name = to.manifest.name.slice(9);
    if (!file || file.startsWith("apps/desktop/runtime/"))
      return rendererPackages.includes(name) || name === "ai";
    return rendererPackages.includes(name);
  }
  if (["apps/web", "apps/storybook"].includes(from.path))
    return rendererPackages.includes(to.manifest.name.slice(9));
  if (from.path.startsWith("apps/")) return true;
  return packageRules[from.manifest.name.slice(9)]?.includes(to.manifest.name.slice(9)) ?? false;
}
function matches(pattern: string, value: string) {
  const [prefix, suffix] = pattern.split("*");
  return suffix === undefined
    ? pattern === value
    : value.startsWith(prefix!) && value.endsWith(suffix);
}
function imports(file: string, source: string): string[] {
  const result = parseSync(file, source);
  const found: string[] = [];
  function walk(node: Node) {
    if (
      (node.type === "ImportDeclaration" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") &&
      node.source
    )
      found.push(node.source.value);
    if (
      node.type === "ImportExpression" &&
      node.source.type === "Literal" &&
      typeof node.source.value === "string"
    )
      found.push(node.source.value);
    if (node.type === "TSImportType") found.push(node.source.value);
    const record = node as unknown as Record<string, unknown>;
    for (const key of visitorKeys[node.type] ?? [])
      for (const child of Array.isArray(record[key]) ? record[key] : [record[key]])
        if (child && typeof child === "object" && "type" in child) walk(child as Node);
  }
  walk(result.program);
  return found;
}
export async function checkArchitecture(
  deps: Pick<PolicyDependencies, "repositoryRoot" | "readFile" | "pathExists">,
  members: readonly string[],
  files: readonly string[],
): Promise<PolicyFinding[]> {
  const workspaces: Workspace[] = await Promise.all(
    members.map(async (path) => ({
      path,
      manifest: JSON.parse(
        await deps.readFile(join(deps.repositoryRoot, path, "package.json")),
      ) as Manifest,
    })),
  );
  const byName = new Map(workspaces.map((w) => [w.manifest.name, w]));
  const findings: PolicyFinding[] = [];
  const edges = new Map(workspaces.map((w) => [w.manifest.name, new Set<string>()]));
  const violation = (file: string, message: string) =>
    findings.push(
      report(
        file,
        message,
        "use the owning layer's public package entrypoint; keep test-only dependencies out of runtime code",
      ),
    );
  for (const workspace of workspaces)
    for (const name of Object.keys(workspace.manifest.dependencies ?? {})) {
      const target = byName.get(name);
      if (!target) continue;
      edges.get(workspace.manifest.name)!.add(name);
      if (!allowed(workspace, target))
        violation(
          `${workspace.path}/package.json`,
          `${workspace.manifest.name} must not depend on ${name}`,
        );
    }
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/.test(file) || /routeTree\.gen\.ts$|\.d\.[cm]?ts$/.test(file)) continue;
    const workspace = workspaces.find((w) => file.startsWith(`${w.path}/`));
    if (!workspace) continue;
    const runtime =
      /\/(src|server|runtime)\//.test(file) &&
      !/(?:\.test|\.spec)\.[jt]sx?$|\/(?:tests?|test-fixtures)\//.test(file);
    const aliases: Record<string, string[]> = {};
    // Resolve local aliases as well as relative paths, so an alias cannot conceal a private cross-package import.
    const config = join(deps.repositoryRoot, workspace.path, "tsconfig.json");
    if (await deps.pathExists(config)) {
      try {
        Object.assign(aliases, JSON.parse(await deps.readFile(config)).compilerOptions?.paths);
      } catch {
        /* TypeScript policy owns malformed JSON. */
      }
    }
    const source = await deps.readFile(join(deps.repositoryRoot, file));
    for (const request of imports(file, source)) {
      const renderer = runtime && file.startsWith("apps/desktop/src/");
      const host = runtime && file.startsWith("apps/desktop/runtime/");
      if (renderer && (request.startsWith("node:") || request.startsWith("@earendil-works/")))
        violation(file, `renderer must use the native bridge, not host dependency: ${request}`);
      if (host && /^(react(?:-dom)?(?:\/|$)|@tauri-apps\/api)/.test(request))
        violation(file, `local runner must not import renderer dependency: ${request}`);
      const name = request.startsWith("@")
        ? request.split("/").slice(0, 2).join("/")
        : request.split("/")[0]!;
      let target = byName.get(name);
      let privatePath = false;
      if (!target) {
        const alias = Object.entries(aliases).find(([pattern]) => matches(pattern, request));
        const local: [string, string] | undefined = Object.entries(
          workspace.manifest.imports ?? {},
        ).find(([pattern]) => matches(pattern, request));
        const mapped: string | undefined = local
          ? local[1].replace("*", request.slice(local[0].split("*")[0]!.length))
          : alias?.[1][0]?.replace("*", request.slice(alias[0].split("*")[0]!.length));
        const path: string | null = request.startsWith(".")
          ? posix.normalize(join(dirname(file), request))
          : mapped
            ? posix.normalize(join(workspace.path, mapped))
            : null;
        if (renderer && path?.startsWith("apps/desktop/runtime/"))
          violation(file, `renderer must not import local runner source: ${request}`);
        if (host && path?.startsWith("apps/desktop/src/"))
          violation(file, `local runner must not import renderer source: ${request}`);
        target = path ? workspaces.find((w) => path.startsWith(`${w.path}/`)) : undefined;
        privatePath = !!target && target !== workspace;
      }
      if (!target || target === workspace) continue;
      const subpath = request === name ? "." : `.${request.slice(name.length)}`;
      if (
        privatePath ||
        !Object.keys(target.manifest.exports ?? {}).some((pattern) => matches(pattern, subpath))
      )
        violation(file, `private cross-package import: ${request}`);
      if (runtime) {
        edges.get(workspace.manifest.name)!.add(target.manifest.name);
        if (!allowed(workspace, target, file))
          violation(file, `forbidden runtime dependency: ${request}`);
        if (!workspace.manifest.dependencies?.[target.manifest.name])
          violation(file, `runtime import requires a declared production dependency: ${request}`);
      }
    }
  }
  const visited = new Set<string>(),
    stack: string[] = [];
  function visit(name: string) {
    if (stack.includes(name)) {
      findings.push(
        report(
          byName.get(name)!.path,
          `workspace dependency cycle: ${[...stack.slice(stack.indexOf(name)), name].join(" -> ")}`,
          "remove the cycle using a lower-layer port",
        ),
      );
      return;
    }
    if (visited.has(name)) return;
    stack.push(name);
    for (const target of edges.get(name) ?? []) visit(target);
    stack.pop();
    visited.add(name);
  }
  for (const name of byName.keys()) visit(name);
  return findings;
}
