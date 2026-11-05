import { globSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface Manifest {
  name: string;
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface Workspace {
  path: string;
  manifest: Manifest;
}

// These helpers run before dependency installation, so they use only Node and built-ins.
export function readWorkspaces(root: string): Map<string, Workspace> {
  const { workspaces } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    workspaces: string[] | { packages: string[] };
  };
  const patterns = Array.isArray(workspaces) ? workspaces : workspaces.packages;
  const files = new Set<string>();
  for (const pattern of patterns)
    for (const file of globSync(`${pattern}/package.json`, { cwd: root })) files.add(file);
  const members = new Map<string, Workspace>();
  for (const file of [...files].sort()) {
    const manifest = JSON.parse(readFileSync(join(root, file), "utf8")) as Manifest;
    if (!manifest.name || members.has(manifest.name))
      throw new Error(`Missing or duplicate workspace name in ${file}`);
    members.set(manifest.name, { path: dirname(file), manifest });
  }
  return members;
}

export function productionWorkspaces(members: Map<string, Workspace>, entry: string): Workspace[] {
  const selected = new Set<Workspace>();
  function visit(name: string) {
    const member = members.get(name);
    if (!member) throw new Error(`Unknown production workspace: ${name}`);
    if (selected.has(member)) return;
    selected.add(member);
    const dependencies = {
      ...member.manifest.dependencies,
      ...member.manifest.optionalDependencies,
      ...member.manifest.peerDependencies,
    };
    for (const [dependency, version] of Object.entries(dependencies)) {
      if (members.has(dependency)) visit(dependency);
      else if (version.startsWith("workspace:"))
        throw new Error(`Unknown production workspace: ${dependency} (required by ${name})`);
    }
  }
  visit(entry);
  return [...selected];
}
