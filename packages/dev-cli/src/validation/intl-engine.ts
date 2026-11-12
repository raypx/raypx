import type { WorkspaceIndex } from "../repo/workspaces.js";

const engine = "use-intl";
const forbidden = ["next-intl"];
const runtimeParts = /^(?:intl-messageformat|@formatjs\/.+)$/;

/**
 * A second copy of the translation engine mounts an unconnected messages context.
 * One workspace declares it; static validators in tooling workspaces may parse ICU.
 */
export function checkIntlEngine(index: WorkspaceIndex): string[] {
  const declared = index.workspaces.map((workspace) => ({
    workspace,
    names: Object.keys({
      ...workspace.manifest.dependencies,
      ...workspace.manifest.devDependencies,
      ...workspace.manifest.peerDependencies,
    }),
  }));
  const owners = declared.filter(({ names }) => names.includes(engine));
  const findings: string[] = [];
  if (owners.length > 1)
    findings.push(
      `${engine} must be declared by one workspace: ${owners.map(({ workspace }) => workspace.path).join(", ")}`,
    );
  for (const { workspace, names } of declared) {
    for (const name of names) {
      if (forbidden.includes(name))
        findings.push(`${workspace.path}: ${name} would install a second translation engine`);
      const allowed = owners.some((owner) => owner.workspace === workspace);
      if (runtimeParts.test(name) && !allowed && workspace.metadata?.kind !== "tooling")
        findings.push(`${workspace.path}: ${name} belongs to the workspace declaring ${engine}`);
    }
  }
  return findings;
}
