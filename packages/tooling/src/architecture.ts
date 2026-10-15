import { existsSync, globSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, posix } from "node:path";
import { parseSync, visitorKeys, type Node } from "oxc-parser";
import {
  compatible,
  exportPaths,
  resolveImport,
  sourceTarget,
  targets,
  workspaceFor,
  type Target,
  type Workspace,
  type WorkspaceIndex,
} from "./workspaces.js";

export interface ImportEdge {
  request: string;
  typesOnly: boolean;
}
export function imports(file: string, source: string): ImportEdge[] {
  const parsed = parseSync(file, source);
  if (parsed.errors.length) throw new Error(`${file}: ${parsed.errors[0]!.message}`);
  const found: ImportEdge[] = [];
  function walk(node: Node) {
    if (
      (node.type === "ImportDeclaration" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") &&
      node.source
    ) {
      const record = node as unknown as {
        importKind?: string;
        exportKind?: string;
        specifiers?: { importKind?: string; exportKind?: string }[];
      };
      const typesOnly =
        record.importKind === "type" ||
        record.exportKind === "type" ||
        (!!record.specifiers?.length &&
          record.specifiers.every((s) => s.importKind === "type" || s.exportKind === "type"));
      found.push({ request: node.source.value, typesOnly });
    }
    if (
      node.type === "ImportExpression" &&
      node.source.type === "Literal" &&
      typeof node.source.value === "string"
    )
      found.push({ request: node.source.value, typesOnly: false });
    if (node.type === "TSImportType") found.push({ request: node.source.value, typesOnly: true });
    const record = node as unknown as Record<string, unknown>;
    for (const key of visitorKeys[node.type] ?? []) {
      for (const child of Array.isArray(record[key]) ? record[key] : [record[key]]) {
        if (child && typeof child === "object" && "type" in child) walk(child as Node);
      }
    }
  }
  walk(parsed.program);
  return found;
}

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const testFile =
  /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\/(?:testing|test-utils)(?:\.[cm]?[jt]sx?$|\/)|\/(?:tests?|__tests__|test-fixtures)\/)/;
const codeFile = /\.[cm]?[jt]sx?$/;
const runtimeFile = /\/(?:src|server|native|app)\//;

function hostViolation(request: string, target: Target): boolean {
  if (request.startsWith("bun:")) return target !== "bun";
  if (request.startsWith("node:") || builtins.has(request))
    return target !== "node" && target !== "bun";
  if (/^(react-dom|@base-ui\/react)(\/|$)/.test(request)) return target !== "browser";
  if (/^(react-native|expo(?:-[^/]+)?)(\/|$)/.test(request)) return target !== "native";
  if (/^electrobun\/(bun|main)(\/|$)/.test(request)) return target !== "bun";
  return false;
}

function resolveCode(index: WorkspaceIndex, path: string): string | undefined {
  const withoutJs = path.replace(/\.[cm]?js$/, "");
  return [
    path,
    `${path}.ts`,
    `${path}.tsx`,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${path}/index.ts`,
    `${path}/index.tsx`,
  ].find((candidate) => codeFile.test(candidate) && existsSync(join(index.root, candidate)));
}

export function checkArchitecture(index: WorkspaceIndex): string[] {
  const findings = [...index.findings];
  const graph = new Map<string, Set<string>>();
  const parsed = new Map<string, ImportEdge[]>();
  const getImports = (file: string) => {
    let edges = parsed.get(file);
    if (!edges) {
      edges = imports(file, readFileSync(join(index.root, file), "utf8"));
      parsed.set(file, edges);
    }
    return edges;
  };
  for (const workspace of index.workspaces) {
    const { manifest, path } = workspace;
    const metadata = manifest.raypx;
    if (
      !metadata ||
      !["app", "library", "tooling"].includes(metadata.kind) ||
      !targets.includes(metadata.target)
    ) {
      findings.push(`${path}/package.json: invalid or missing raypx metadata`);
      continue;
    }
    if (!manifest.private || manifest.type !== "module")
      findings.push(`${path}: workspaces must be private ESM`);
    for (const [entry, target] of Object.entries(metadata.entryTargets ?? {})) {
      if (!manifest.exports?.[entry] || !targets.includes(target))
        findings.push(`${path}: invalid entryTargets override ${entry}`);
    }
    for (const [scope, target] of Object.entries(metadata.sourceTargets ?? {})) {
      if (!scope || !targets.includes(target))
        findings.push(`${path}: invalid sourceTargets override ${scope}`);
    }
    if (metadata.kind === "library" && !Object.keys(manifest.exports ?? {}).length)
      findings.push(`${path}: libraries need explicit exports`);
    for (const [entry, value] of Object.entries(manifest.exports ?? {})) {
      for (const exported of exportPaths(value)) {
        const exists = exported.includes("*")
          ? globSync(posix.join(path, exported), { cwd: index.root }).length > 0
          : existsSync(join(index.root, path, exported));
        if (!exported.startsWith("./") || exported.includes("..") || !exists)
          findings.push(`${path}: missing or invalid export ${entry}: ${exported}`);
      }
    }
    const edges = new Set<string>();
    graph.set(manifest.name, edges);
    for (const [field, deps] of Object.entries({
      dependencies: manifest.dependencies,
      devDependencies: manifest.devDependencies,
      peerDependencies: manifest.peerDependencies,
    })) {
      for (const [name, range] of Object.entries(deps ?? {})) {
        const to = index.byName.get(name);
        if (!to) {
          if (range.startsWith("workspace:"))
            findings.push(`${path}: missing workspace dependency ${name}`);
          continue;
        }
        edges.add(name);
        if (range !== "workspace:*")
          findings.push(`${path}: internal dependency ${name} must use workspace:*`);
        if (to.manifest.raypx?.kind === "app")
          findings.push(`${path}: applications cannot be imported: ${name}`);
        if (
          field === "dependencies" &&
          metadata.kind !== "tooling" &&
          to.manifest.raypx?.kind === "tooling"
        )
          findings.push(`${path}: runtime cannot depend on tooling: ${name}`);
      }
    }
  }

  const visited = new Set<string>();
  const active: string[] = [];
  function visit(name: string) {
    if (active.includes(name)) {
      findings.push(
        `workspace dependency cycle: ${[...active.slice(active.indexOf(name)), name].join(" -> ")}`,
      );
      return;
    }
    if (visited.has(name)) return;
    active.push(name);
    for (const next of graph.get(name) ?? []) visit(next);
    active.pop();
    visited.add(name);
  }
  for (const name of graph.keys()) visit(name);

  function checkEdge(
    workspace: Workspace,
    file: string,
    edge: ImportEdge,
    platform: Target,
    transitive: boolean,
  ): string[] {
    const { request, typesOnly } = edge;
    if (
      /\/(?:testing|test-utils)(?:\/|$)/.test(request) &&
      !testFile.test(file) &&
      workspace.manifest.raypx?.kind !== "tooling"
    )
      findings.push(`${file}: runtime cannot import test-only entry ${request}`);
    if (!typesOnly && hostViolation(request, platform))
      findings.push(`${file}: ${platform} code cannot import ${request}`);
    const resolved = resolveImport(index, workspace, file, request);
    const to = resolved.target;
    if (!to) {
      if (
        !resolved.paths.length &&
        !request.startsWith(".") &&
        !request.startsWith("#") &&
        !request.startsWith("virtual:") &&
        !request.startsWith("bun:") &&
        !request.startsWith("node:") &&
        !builtins.has(request)
      ) {
        const name = request.startsWith("@")
          ? request.split("/").slice(0, 2).join("/")
          : request.split("/")[0]!;
        const declared =
          workspace.manifest.dependencies?.[name] ||
          workspace.manifest.peerDependencies?.[name] ||
          (typesOnly && workspace.manifest.devDependencies?.[name]);
        if (!declared)
          findings.push(
            `${file}: undeclared ${typesOnly ? "type" : "runtime"} dependency ${request}`,
          );
      }
      return resolved.paths;
    }
    if (resolved.privatePath) findings.push(`${file}: private cross-workspace import ${request}`);
    if (to !== workspace) {
      if (to.manifest.raypx?.kind === "app")
        findings.push(`${file}: application source cannot be imported: ${request}`);
      const declared =
        workspace.manifest.dependencies?.[to.manifest.name] ||
        workspace.manifest.peerDependencies?.[to.manifest.name];
      if (!declared && !(typesOnly && workspace.manifest.devDependencies?.[to.manifest.name]))
        findings.push(
          `${file}: undeclared ${typesOnly ? "type" : "runtime"} dependency ${request}`,
        );
      if (
        !typesOnly &&
        workspace.manifest.raypx?.kind !== "tooling" &&
        to.manifest.raypx?.kind === "tooling"
      )
        findings.push(`${file}: runtime cannot import tooling ${request}`);
      if (!typesOnly && !compatible(platform, resolved.targetPlatform))
        findings.push(
          `${file}: ${platform} entry cannot import ${resolved.targetPlatform} entry ${request}${transitive ? " (transitive)" : ""}`,
        );
    }
    for (const path of resolved.paths)
      if (!testFile.test(file) && testFile.test(path))
        findings.push(`${file}: runtime cannot import test-only source ${request}`);
    return typesOnly ? [] : resolved.paths;
  }

  for (const workspace of index.workspaces) {
    const files = globSync(`${workspace.path}/**/*.{ts,tsx,mts,js,mjs}`, {
      cwd: index.root,
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.output/**",
        "**/.hutch/**",
        "**/build/**",
        "**/artifacts/**",
        "**/routeTree.gen.ts",
        "**/*.d.ts",
      ],
    });
    for (const file of files) {
      const normalized = file.replaceAll("\\", "/");
      if (!runtimeFile.test(normalized) || testFile.test(normalized)) continue;
      try {
        for (const edge of getImports(normalized))
          checkEdge(workspace, normalized, edge, sourceTarget(workspace, normalized), false);
      } catch (error) {
        findings.push(String(error));
      }
    }
    for (const [entry, value] of Object.entries(workspace.manifest.exports ?? {})) {
      const target =
        workspace.manifest.raypx?.entryTargets?.[entry] ??
        workspace.manifest.raypx?.target ??
        "universal";
      const seen = new Set<string>();
      function walk(path: string) {
        const file = resolveCode(index, path);
        if (!file || seen.has(file)) return;
        seen.add(file);
        const owner = workspaceFor(index, file);
        if (!owner) return;
        try {
          if (
            (target === "universal" || target === "native") &&
            /(?<![\w.])(?:window|document|localStorage|sessionStorage)\s*[.(]/.test(
              readFileSync(join(index.root, file), "utf8"),
            )
          )
            findings.push(`${workspace.path}: ${entry} reaches DOM global in ${file}`);
          for (const edge of getImports(file))
            for (const next of checkEdge(owner, file, edge, target, true)) walk(next);
        } catch (error) {
          findings.push(String(error));
        }
      }
      for (const path of exportPaths(value)) {
        const exported = posix.join(workspace.path, path);
        if (exported.includes("*"))
          for (const file of globSync(exported, { cwd: index.root }))
            walk(file.replaceAll("\\", "/"));
        else walk(exported);
      }
    }
  }
  return [...new Set(findings)];
}
