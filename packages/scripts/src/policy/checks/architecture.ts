import { join } from "node:path";
import { parseSync, visitorKeys, type Node } from "oxc-parser";
import {
  allowedDependency,
  createArchitectureIndex,
  isArchitectureSource,
  isRuntimeSource,
  resolveWorkspaceImport,
  workspaceForFile,
  type WorkspaceManifest,
} from "../../architecture/model.ts";
import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { findingFor } from "../findings.js";

const report = findingFor("architecture.boundary");

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

/** Manifest direction and the complete graph stay repository-wide; Oxlint owns source diagnostics. */
export async function checkArchitecture(
  deps: Pick<PolicyDependencies, "repositoryRoot" | "readFile" | "pathExists">,
  members: readonly string[],
  files: readonly string[],
): Promise<PolicyFinding[]> {
  const index = createArchitectureIndex(
    await Promise.all(
      members.map(async (path) => {
        const manifest = JSON.parse(
          await deps.readFile(join(deps.repositoryRoot, path, "package.json")),
        ) as WorkspaceManifest;
        const config = join(deps.repositoryRoot, path, "tsconfig.json");
        let aliases: Record<string, string[]> = {};
        if (await deps.pathExists(config)) {
          try {
            aliases = JSON.parse(await deps.readFile(config)).compilerOptions?.paths ?? {};
          } catch {
            /* TypeScript policy owns malformed JSON. */
          }
        }
        return { path, manifest, aliases };
      }),
    ),
  );
  const findings: PolicyFinding[] = [];
  const edges = new Map(
    index.workspaces.map((workspace) => [workspace.manifest.name, new Set<string>()]),
  );

  for (const workspace of index.workspaces)
    for (const name of Object.keys(workspace.manifest.dependencies ?? {})) {
      const target = index.byName.get(name);
      if (!target) continue;
      edges.get(workspace.manifest.name)!.add(name);
      if (!allowedDependency(workspace, target))
        findings.push(
          report(
            `${workspace.path}/package.json`,
            `${workspace.manifest.name} must not depend on ${name}`,
            "use the owning layer's public package entrypoint; keep test-only dependencies out of runtime code",
          ),
        );
    }

  // Source edges are required even for undeclared imports and partial/incremental lint runs.
  for (const file of files) {
    if (!isArchitectureSource(file) || !isRuntimeSource(file)) continue;
    const workspace = workspaceForFile(index, file);
    if (!workspace) continue;
    for (const request of imports(file, await deps.readFile(join(deps.repositoryRoot, file)))) {
      const target = resolveWorkspaceImport(index, file, request).target;
      if (target && target !== workspace)
        edges.get(workspace.manifest.name)!.add(target.manifest.name);
    }
  }

  const visited = new Set<string>();
  const stack: string[] = [];
  function visit(name: string) {
    if (stack.includes(name)) {
      findings.push(
        report(
          index.byName.get(name)!.path,
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
  for (const name of index.byName.keys()) visit(name);
  return findings;
}
