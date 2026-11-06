import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseYAML } from "confbox/yaml";

/** Keep pnpm configuration in its native file, with strict runtime enforcement. */
export function checkWorkspaceConfiguration(root: string) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const findings: string[] = [];
  for (const key of ["workspaces", "overrides"])
    if (key in manifest) findings.push(`package.json: move ${key} to pnpm-workspace.yaml`);
  try {
    const configuration = parseYAML<{
      packages?: unknown;
      engineStrict?: boolean;
    }>(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"));
    if (
      !Array.isArray(configuration?.packages) ||
      !configuration.packages.length ||
      !configuration.packages.every((pattern) => typeof pattern === "string" && pattern.length > 0)
    )
      findings.push("pnpm-workspace.yaml: declare workspace packages");
    if (configuration?.engineStrict !== true)
      findings.push("pnpm-workspace.yaml: engineStrict must be true");
  } catch {
    findings.push("pnpm-workspace.yaml: expected valid workspace configuration");
  }
  return findings;
}
