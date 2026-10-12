import { join } from "node:path";

import { validateWorkspaceAgents } from "../agents.js";
import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { parseIgnorePatterns, validateWorkspaceIgnore } from "../ignores.js";

export async function checkWorkspaceAgents(
  dependencies: PolicyDependencies,
  members: readonly string[],
): Promise<PolicyFinding[]> {
  const findings: PolicyFinding[] = [];
  for (const member of members) {
    const location = `${member}/AGENTS.md`;
    const absolute = join(dependencies.repositoryRoot, location);
    if (!(await dependencies.pathExists(absolute))) {
      findings.push({
        check: "agents.workspace",
        location,
        message: "workspace is missing AGENTS.md",
        fix: `create ${location} with Purpose, Interface, Ownership, Constraints, and Verification sections`,
        severity: "error",
      });
      continue;
    }
    findings.push(...validateWorkspaceAgents(location, await dependencies.readFile(absolute)));
  }
  return findings;
}

export async function checkWorkspaceIgnores(
  dependencies: PolicyDependencies,
  members: readonly string[],
): Promise<PolicyFinding[]> {
  const rootPatterns = parseIgnorePatterns(
    await dependencies.readFile(join(dependencies.repositoryRoot, ".gitignore")),
  );
  const findings: PolicyFinding[] = [];
  for (const member of members) {
    const location = `${member}/.gitignore`;
    const absolute = join(dependencies.repositoryRoot, location);
    if (!(await dependencies.pathExists(absolute))) continue;
    findings.push(
      ...validateWorkspaceIgnore(location, await dependencies.readFile(absolute), rootPatterns),
    );
  }
  return findings;
}
