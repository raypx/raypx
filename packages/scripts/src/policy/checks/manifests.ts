import { join } from "node:path";

import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { deriveWorkspaceShape, validateWorkspaceManifest } from "../manifests.js";
import { validateTestWiring } from "../manifests/wiring.js";

export async function checkWorkspaceManifests(
  dependencies: PolicyDependencies,
  members: readonly string[],
  workspaceFiles: readonly string[],
): Promise<PolicyFinding[]> {
  const findings: PolicyFinding[] = [];
  for (const member of members) {
    const location = `${member}/package.json`;
    const shape = deriveWorkspaceShape(member, workspaceFiles);
    findings.push(
      ...validateWorkspaceManifest(
        location,
        await dependencies.readFile(join(dependencies.repositoryRoot, location)),
        shape,
      ),
      ...validateTestWiring(`${member}/vitest.config.ts`, shape),
    );
  }
  return findings;
}
