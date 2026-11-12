import { existsSync, globSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, posix } from "node:path";
import { parseSync, visitorKeys, type Node } from "oxc-parser";
import {
  compatible,
  exportPaths,
  kinds,
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
/** Static import, re-export, dynamic import and `import()` type edges, without executing code. */
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

function bundledWorkspace(workspace: Workspace, name: string): boolean {
  return (
    (workspace.metadata?.kind === "app" || workspace.metadata?.kind === "tooling") &&
    workspace.metadata.bundledDependencies?.includes(name) === true &&
    !!workspace.manifest.devDependencies?.[name]
  );
}

function children(node: Node): Node[] {
  const record = node as unknown as Record<string, unknown>;
  return (visitorKeys[node.type] ?? []).flatMap((key) =>
    (Array.isArray(record[key]) ? record[key] : [record[key]]).filter(
      (child): child is Node => !!child && typeof child === "object" && "type" in child,
    ),
  );
}

/** Resolve local bindings so data named `document` is not mistaken for the DOM. */
function reachesDomGlobal(file: string, source: string): boolean {
  const { program, errors } = parseSync(file, source);
  if (errors.length) throw new Error(`${file}: ${errors[0]!.message}`);
  interface Scope {
    names: Set<string>;
    parent: Scope | undefined;
  }
  const lexicalScopes = new Set([
    "BlockStatement",
    "ForStatement",
    "ForInStatement",
    "ForOfStatement",
    "SwitchStatement",
  ]);
  function bind(node: Node | null | undefined, names: Set<string>) {
    if (!node) return;
    if (node.type === "Identifier") names.add(node.name);
    else if (node.type === "RestElement") bind(node.argument, names);
    else if (node.type === "AssignmentPattern") bind(node.left, names);
    else if (node.type === "ArrayPattern") for (const child of node.elements) bind(child, names);
    else if (node.type === "ObjectPattern")
      for (const property of node.properties)
        bind(property.type === "RestElement" ? property.argument : property.value, names);
  }
  function declarations(node: Node, names: Set<string>, nested = false) {
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression" ||
      node.type === "ClassDeclaration" ||
      node.type === "ClassExpression"
    ) {
      if (!nested && "id" in node) bind(node.id, names);
      return;
    }
    if (node.type === "VariableDeclaration") {
      if (!nested || node.kind === "var")
        for (const declaration of node.declarations) bind(declaration.id, names);
      return;
    }
    if (!nested && node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers) bind(specifier.local, names);
      return;
    }
    for (const child of children(node))
      declarations(child, names, nested || lexicalScopes.has(child.type));
  }
  function bound(name: string, scope: Scope | undefined): boolean {
    return !!scope && (scope.names.has(name) || bound(name, scope.parent));
  }
  const dom = new Set(["window", "document", "localStorage", "sessionStorage"]);
  function walk(node: Node, parent: Scope | undefined): boolean {
    let scope = parent;
    if (
      node.type === "Program" ||
      lexicalScopes.has(node.type) ||
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression" ||
      node.type === "CatchClause"
    ) {
      scope = { names: new Set(), parent };
      if (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression"
      ) {
        for (const parameter of node.params) bind(parameter, scope.names);
        if ("id" in node) bind(node.id, scope.names);
        if (node.body) declarations(node.body, scope.names);
      } else if (node.type === "CatchClause") bind(node.param, scope.names);
      else
        for (const child of children(node))
          declarations(child, scope.names, lexicalScopes.has(child.type));
    }
    if (
      node.type === "MemberExpression" &&
      node.object.type === "Identifier" &&
      dom.has(node.object.name) &&
      !bound(node.object.name, scope)
    )
      return true;
    return children(node).some((child) => walk(child, scope));
  }
  return walk(program, undefined);
}

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

/**
 * Checks workspace metadata, exports, the dependency graph and every runtime import:
 * declarations, internal paths, platform targets, tooling and test-only boundaries.
 */
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
    const { manifest, path, metadata } = workspace;
    if (!metadata || !kinds.includes(metadata.kind) || !targets.includes(metadata.target)) {
      const finding =
        index.metadataSource === "options"
          ? `${path}: ${metadata === undefined ? "missing" : "invalid"} supplied workspace metadata`
          : `${path}/package.json: invalid or missing ${index.metadataKey} metadata`;
      if (!findings.includes(finding)) findings.push(finding);
      continue;
    }
    if (manifest.type !== "module") findings.push(`${path}: workspaces must be ESM`);
    if (metadata.kind === "app" && !manifest.private)
      findings.push(`${path}: applications must be private`);
    for (const [entry, target] of Object.entries(metadata.entryTargets ?? {})) {
      if (!manifest.exports?.[entry] || !targets.includes(target))
        findings.push(`${path}: invalid entryTargets override ${entry}`);
    }
    for (const [scope, target] of Object.entries(metadata.sourceTargets ?? {})) {
      if (!scope || !targets.includes(target))
        findings.push(`${path}: invalid sourceTargets override ${scope}`);
    }
    for (const [entry, source] of Object.entries(metadata.sourceEntries ?? {})) {
      if (
        !manifest.exports?.[entry] ||
        !source.startsWith("./") ||
        source.split("/").includes("..") ||
        !codeFile.test(source) ||
        (source.includes("*")
          ? !entry.includes("*") || !globSync(posix.join(path, source), { cwd: index.root }).length
          : !existsSync(join(index.root, path, source)))
      )
        findings.push(`${path}: invalid sourceEntries override ${entry}: ${source}`);
    }
    for (const name of metadata.bundledDependencies ?? []) {
      if (
        !manifest.devDependencies?.[name] ||
        (index.byName.has(name) && !bundledWorkspace(workspace, name))
      )
        findings.push(
          `${path}: bundled dependency must be an external development dependency: ${name}`,
        );
    }
    if (metadata.kind === "library" && !Object.keys(manifest.exports ?? {}).length)
      findings.push(`${path}: libraries need explicit exports`);
    for (const [entry, value] of Object.entries(manifest.exports ?? {})) {
      for (const exported of exportPaths(value)) {
        const exists = exported.includes("*")
          ? globSync(posix.join(path, exported), { cwd: index.root }).length > 0
          : existsSync(join(index.root, path, exported));
        if (
          !exported.startsWith("./") ||
          exported.includes("..") ||
          (!metadata.sourceEntries?.[entry] && !exists)
        )
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
        if (to.metadata?.kind === "app")
          findings.push(`${path}: applications cannot be imported: ${name}`);
        if (
          field === "dependencies" &&
          metadata.kind !== "tooling" &&
          to.metadata?.kind === "tooling"
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
      workspace.metadata?.kind !== "tooling"
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
          (workspace.metadata?.bundledDependencies?.includes(name) &&
            workspace.manifest.devDependencies?.[name]) ||
          (typesOnly &&
            (workspace.manifest.devDependencies?.[name] ||
              workspace.manifest.devDependencies?.[
                `@types/${name.startsWith("@") ? name.slice(1).replace("/", "__") : name}`
              ]));
        if (!declared)
          findings.push(
            `${file}: undeclared ${typesOnly ? "type" : "runtime"} dependency ${request}`,
          );
      }
      return resolved.paths;
    }
    if (resolved.internalPath) findings.push(`${file}: internal cross-workspace import ${request}`);
    if (to !== workspace) {
      if (to.metadata?.kind === "app")
        findings.push(`${file}: application source cannot be imported: ${request}`);
      const declared =
        workspace.manifest.dependencies?.[to.manifest.name] ||
        workspace.manifest.peerDependencies?.[to.manifest.name] ||
        bundledWorkspace(workspace, to.manifest.name);
      if (!declared && !(typesOnly && workspace.manifest.devDependencies?.[to.manifest.name]))
        findings.push(
          `${file}: undeclared ${typesOnly ? "type" : "runtime"} dependency ${request}`,
        );
      if (!typesOnly && workspace.metadata?.kind !== "tooling" && to.metadata?.kind === "tooling")
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
        workspace.metadata?.entryTargets?.[entry] ?? workspace.metadata?.target ?? "universal";
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
            reachesDomGlobal(file, readFileSync(join(index.root, file), "utf8"))
          )
            findings.push(`${workspace.path}: ${entry} reaches DOM global in ${file}`);
          for (const edge of getImports(file))
            for (const next of checkEdge(owner, file, edge, target, true)) walk(next);
        } catch (error) {
          findings.push(String(error));
        }
      }
      const source = workspace.metadata?.sourceEntries?.[entry];
      for (const path of source ? [source] : exportPaths(value)) {
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
