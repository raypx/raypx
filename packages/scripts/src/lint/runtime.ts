import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createArchitectureIndex,
  type ArchitectureWorkspace,
  type WorkspaceManifest,
} from "../architecture/model.ts";

/** One immutable metadata snapshot per CLI plugin instance, shared by every linted file. */
export function loadArchitectureIndex(repositoryRoot: string) {
  const root = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
    workspaces?: string[] | { packages?: string[] };
  };
  const patterns = Array.isArray(root.workspaces)
    ? root.workspaces
    : (root.workspaces?.packages ?? []);
  const workspaces: ArchitectureWorkspace[] = globSync(
    patterns.map((pattern) => `${pattern}/package.json`),
    { cwd: repositoryRoot },
  )
    .sort()
    .map((path) => {
      const directory = path.replace(/\\/g, "/").slice(0, -"/package.json".length);
      const manifest = JSON.parse(
        readFileSync(join(repositoryRoot, path), "utf8"),
      ) as WorkspaceManifest;
      const config = join(repositoryRoot, directory, "tsconfig.json");
      let aliases: Record<string, string[]> = {};
      if (existsSync(config)) {
        try {
          aliases = JSON.parse(readFileSync(config, "utf8")).compilerOptions?.paths ?? {};
        } catch {
          /* TypeScript policy owns malformed JSON. */
        }
      }
      return { path: directory, manifest, aliases };
    });
  return createArchitectureIndex(workspaces);
}
