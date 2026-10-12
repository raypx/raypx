import { posix } from "node:path";

export interface WorkspaceManifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  imports?: Record<string, string>;
}

export interface ArchitectureWorkspace {
  path: string;
  manifest: WorkspaceManifest;
  aliases?: Record<string, string[]>;
}

export interface ArchitectureIndex {
  workspaces: readonly ArchitectureWorkspace[];
  byName: ReadonlyMap<string, ArchitectureWorkspace>;
}

const packagePrefix = "@raypx/";
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

export function createArchitectureIndex(
  workspaces: readonly ArchitectureWorkspace[],
): ArchitectureIndex {
  return {
    workspaces,
    byName: new Map(workspaces.map((workspace) => [workspace.manifest.name, workspace])),
  };
}

export function allowedDependency(from: ArchitectureWorkspace, to: ArchitectureWorkspace): boolean {
  if (to.path.startsWith("apps/")) return false;
  if (from.manifest.name === "@raypx/scripts" || from.path === "e2e") return true;
  if (to.manifest.name === "@raypx/scripts") return false;
  const toPackage = to.manifest.name.slice(packagePrefix.length);
  if (["apps/web", "apps/desktop", "apps/storybook"].includes(from.path))
    return rendererPackages.includes(toPackage);
  if (from.path.startsWith("apps/")) return true;
  const fromPackage = from.manifest.name.slice(packagePrefix.length);
  return packageRules[fromPackage]?.includes(toPackage) ?? false;
}

export function workspaceForFile(
  index: ArchitectureIndex,
  file: string,
): ArchitectureWorkspace | undefined {
  return index.workspaces.find((workspace) => file.startsWith(`${workspace.path}/`));
}

export function isArchitectureSource(file: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(file) && !/routeTree\.gen\.ts$|\.d\.[cm]?ts$/.test(file);
}

export function isRuntimeSource(file: string): boolean {
  return (
    /\/(src|server|runtime|native)\//.test(file) &&
    !/(?:\.test|\.spec)\.[jt]sx?$|\/(?:tests?|test-fixtures)\//.test(file)
  );
}

function matches(pattern: string, value: string): boolean {
  const [prefix, suffix] = pattern.split("*");
  return suffix === undefined
    ? pattern === value
    : value.startsWith(prefix!) && value.endsWith(suffix);
}

export function resolveWorkspaceImport(index: ArchitectureIndex, file: string, request: string) {
  const workspace = workspaceForFile(index, file);
  const name = request.startsWith("@")
    ? request.split("/").slice(0, 2).join("/")
    : request.split("/")[0]!;
  const named = index.byName.get(name);
  if (named)
    return {
      target: named,
      privatePath: false,
      path: null,
      subpath: request === name ? "." : `.${request.slice(name.length)}`,
    };
  const alias = Object.entries(workspace?.aliases ?? {}).find(([pattern]) =>
    matches(pattern, request),
  );
  const local = Object.entries(workspace?.manifest.imports ?? {}).find(([pattern]) =>
    matches(pattern, request),
  );
  const mapped = local
    ? local[1].replace("*", request.slice(local[0].split("*")[0]!.length))
    : alias?.[1][0]?.replace("*", request.slice(alias[0].split("*")[0]!.length));
  const path = request.startsWith(".")
    ? posix.normalize(posix.join(posix.dirname(file), request))
    : mapped && workspace
      ? posix.normalize(posix.join(workspace.path, mapped))
      : null;
  const target = path ? workspaceForFile(index, path) : undefined;
  return { target, privatePath: !!target && target !== workspace, path, subpath: "." };
}

/** Source diagnostics belong to Oxlint; policy consumes only resolved runtime graph edges. */
export function sourceImportViolations(
  index: ArchitectureIndex,
  file: string,
  request: string,
): string[] {
  if (!isArchitectureSource(file)) return [];
  const workspace = workspaceForFile(index, file);
  if (!workspace) return [];
  const runtime = isRuntimeSource(file);
  const renderer = runtime && file.startsWith("apps/desktop/src/");
  const messages: string[] = [];
  if (
    renderer &&
    (request.startsWith("node:") ||
      request.startsWith("bun:") ||
      request.startsWith("@earendil-works/") ||
      request === "electrobun" ||
      /^electrobun\/(main|bun)(\/|$)/.test(request))
  )
    messages.push(`renderer must use the native bridge, not host dependency: ${request}`);
  const { target, privatePath, path, subpath } = resolveWorkspaceImport(index, file, request);
  if (renderer && path?.startsWith("apps/desktop/native/") && !/\/rpc(?:\.[cm]?ts)?$/.test(path))
    messages.push(`renderer must use the window bridge, not native host source: ${request}`);
  if (!target || target === workspace) return messages;
  if (
    privatePath ||
    !Object.keys(target.manifest.exports ?? {}).some((pattern) => matches(pattern, subpath))
  )
    messages.push(`private cross-package import: ${request}`);
  if (runtime) {
    if (!allowedDependency(workspace, target))
      messages.push(`forbidden runtime dependency: ${request}`);
    if (!workspace.manifest.dependencies?.[target.manifest.name])
      messages.push(`runtime import requires a declared production dependency: ${request}`);
  }
  return messages;
}
