import { join } from "node:path";

import type { PolicyDependencies } from "./checks.js";
import { fixWorkspaceIgnore, parseIgnorePatterns } from "./ignores.js";
import { deriveWorkspaceShape, fixWorkspaceManifest } from "./manifests.js";

/**
 * Applies the findings that have exactly one possible remedy and returns the
 * repository-relative files it rewrote.
 *
 * Deliberately separate from `runPolicy`: the checker is the gate `rpx verify`
 * runs, and a gate that edits the tree it is judging would report on a repository
 * nobody has seen. Whether a fix applied is not asserted here either — the caller
 * re-runs the checks afterwards, so what survives is the answer.
 */
export async function applyPolicyFixes(dependencies: PolicyDependencies): Promise<string[]> {
  const [members, workspaceFiles] = await Promise.all([
    dependencies.listWorkspaceMembers(),
    dependencies.listWorkspaceFiles(),
  ]);

  const changed: string[] = [];
  const rewrite = async (location: string, fix: (content: string) => string): Promise<void> => {
    const absolute = join(dependencies.repositoryRoot, location);
    const content = await dependencies.readFile(absolute);
    const fixed = fix(content);
    if (fixed === content) return;
    await dependencies.writeFile(absolute, fixed);
    changed.push(location);
  };

  const rootPatterns = parseIgnorePatterns(
    await dependencies.readFile(join(dependencies.repositoryRoot, ".gitignore")),
  );

  for (const member of members) {
    const shape = deriveWorkspaceShape(member, workspaceFiles);

    await rewrite(`${member}/package.json`, (content) => fixWorkspaceManifest(content, shape));

    const ignore = `${member}/.gitignore`;
    if (await dependencies.pathExists(join(dependencies.repositoryRoot, ignore))) {
      await rewrite(ignore, (content) => fixWorkspaceIgnore(content, rootPatterns));
    }
  }

  return changed;
}
