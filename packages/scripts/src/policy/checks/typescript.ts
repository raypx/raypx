import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";

import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { deriveWorkspaceShape } from "../manifests.js";
import { presetRoot, validateWorkspaceTypeScriptConfig } from "../tsconfig.js";

export async function checkTypeScriptConfigs(
  dependencies: PolicyDependencies,
  members: readonly string[],
  workspaceFiles: readonly string[],
): Promise<PolicyFinding[]> {
  // Load presets from @voidmix/tsconfig npm package
  const presets = new Map<string, string>();
  const presetDir = join(dependencies.repositoryRoot, presetRoot);
  try {
    const files = readdirSync(presetDir);
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'package.json') {
        const fullPath = join(presetDir, file);
        const relativePath = join(presetRoot, file);
        presets.set(relativePath, readFileSync(fullPath, 'utf-8'));
      }
    }
  } catch (error) {
    // If @voidmix/tsconfig is not installed, skip preset validation
    console.warn(`Could not load presets from ${presetRoot}:`, error);
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
