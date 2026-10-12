import { join } from "node:path";

import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { deriveWorkspaceShape } from "../manifests.js";
import { isPresetFile, validateWorkspaceTypeScriptConfig } from "../tsconfig.js";

export async function checkTypeScriptConfigs(
  dependencies: PolicyDependencies,
  members: readonly string[],
  workspaceFiles: readonly string[],
): Promise<PolicyFinding[]> {
  const presets = new Map<string, string>();
  for (const file of workspaceFiles.filter(isPresetFile)) {
    presets.set(file, await dependencies.readFile(join(dependencies.repositoryRoot, file)));
  }

  const findings: PolicyFinding[] = [];
  for (const member of members) {
    for (const config of deriveWorkspaceShape(member, workspaceFiles).typeScriptConfigs) {
      const location = `${member}/${config}`;
      findings.push(
        ...validateWorkspaceTypeScriptConfig(
          location,
          await dependencies.readFile(join(dependencies.repositoryRoot, location)),
          presets,
        ),
      );
    }
  }
  return findings;
}
