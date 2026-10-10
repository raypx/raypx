import type { PolicyFinding } from "./report.ts";
import type { PolicyRepository } from "./runtime.ts";

export function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export interface PolicyWorkspace {
  directory: string;
  manifest: Record<string, unknown>;
}

async function manifest(repository: PolicyRepository, path: string, findings: PolicyFinding[]) {
  const content = await repository.read(path);
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = content === undefined ? undefined : object(JSON.parse(content));
  } catch {
    /* Report without echoing manifest content. */
  }
  if (!parsed)
    findings.push({
      rule: "workspace.manifest",
      path,
      message: "A valid first-party package.json object is required.",
      fix: "Add or repair package.json and ensure it is not ignored or linked outside the repository.",
    });
  return parsed;
}

export async function checkWorkspaces(
  repository: PolicyRepository,
  findings: PolicyFinding[],
): Promise<PolicyWorkspace[]> {
  const root = await manifest(repository, "package.json", findings);
  const raw = Array.isArray(root?.workspaces)
    ? root.workspaces
    : object(root?.workspaces)?.packages;
  const patterns: string[] = [];
  if (!Array.isArray(raw) || !raw.length)
    findings.push({
      rule: "workspace.patterns",
      path: "package.json",
      message: "workspaces must declare the application and package directories.",
      fix: "Declare workspaces as an array or workspaces.packages, normally apps/* and packages/*.",
    });
  else
    for (const value of raw) {
      if (
        typeof value !== "string" ||
        !/^!?\.?(?:\/)?(?:apps|packages)\/[^/]+\/?$/.test(value) ||
        /[{}[\]?]/.test(value)
      ) {
        findings.push({
          rule: "workspace.patterns",
          path: "package.json",
          message: "Unsupported workspace pattern.",
          fix: "Use direct apps/*, packages/*, or explicit application/package paths; exclusions may start with !.",
        });
      } else patterns.push(value.replace(/^\.\//, "").replace(/\/$/, ""));
    }
  const matches = (directory: string) => {
    let included = false;
    for (const pattern of patterns) {
      const negative = pattern.startsWith("!");
      const text = negative ? pattern.slice(1) : pattern;
      const escaped = text
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*");
      if (new RegExp(`^${escaped}$`).test(directory)) included = !negative;
    }
    return included;
  };
  const names = new Map<string, string>();
  const workspaces: PolicyWorkspace[] = [];
  if (typeof root?.name === "string") names.set(root.name, "package.json");
  for (const directory of repository.workspaceDirectories) {
    const path = `${directory}/package.json`;
    if (!matches(directory))
      findings.push({
        rule: "workspace.coverage",
        path,
        message: "Directory is not covered by root workspaces.",
        fix: "Include this workspace in root workspaces or move non-workspace content outside apps/ and packages/.",
      });
    const value = await manifest(repository, path, findings);
    if (!value) continue;
    const name = value.name;
    if (
      typeof name !== "string" ||
      !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)
    )
      findings.push({
        rule: "workspace.name",
        path,
        message: "Manifest must declare a valid package name.",
        fix: "Set a nonempty npm-compatible name, such as @raypx/example.",
      });
    else if (names.has(name))
      findings.push({
        rule: "workspace.name",
        path,
        message: `Package name ${name} is already declared in ${names.get(name)}.`,
        fix: "Give each root and workspace manifest a unique package name.",
      });
    else names.set(name, path);
    workspaces.push({ directory, manifest: value });
  }
  return workspaces;
}
