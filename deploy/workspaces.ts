import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";

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
  root = realpathSync(root);
  const listed = JSON.parse(
    execFileSync("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as { path: string }[];
  const files = listed
    .map((member) => relative(root, member.path))
    .filter(Boolean)
    .map((path) => join(path, "package.json"));
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
