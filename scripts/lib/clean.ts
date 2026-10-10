import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const artifacts = [
  "dist",
  ".output",
  ".tanstack",
  "coverage",
  ".vitest",
  "storybook-static",
  "playwright-report",
  "test-results",
  "node_modules/.vite",
  "node_modules/.vite-temp",
  "node_modules/.nitro",
  "node_modules/.cache/storybook",
  "node_modules/.cache/sb-vite-plugin-externals",
  "node_modules/.cache/jiti",
] as const;

async function stat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

// Check every ancestor with lstat: a linked workspace/cache parent must never
// redirect deletion outside the checkout. A leaf symlink can itself be removed.
async function hasLocalParents(root: string, path: string): Promise<boolean> {
  const parent = dirname(path);
  if (parent === root) return true;
  if (!(await hasLocalParents(root, parent))) return false;
  return (await stat(parent))?.isDirectory() === true;
}

/** Remove known generated artifacts only; dry runs return the same relative paths without writes. */
export async function cleanRepository(root: string, dryRun = false): Promise<string[]> {
  const directory = await realpath(root);
  const scopes = [directory];
  for (const group of ["apps", "packages"]) {
    const parent = join(directory, group);
    if (!(await stat(parent))?.isDirectory()) continue;
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workspace = join(parent, entry.name);
      if ((await stat(join(workspace, "package.json")))?.isFile()) scopes.push(workspace);
    }
  }
  if ((await stat(join(directory, "scripts")))?.isDirectory())
    scopes.push(join(directory, "scripts"));

  const candidates = [
    join(directory, ".ci-reports"),
    join(directory, "apps/web/src/routeTree.gen.ts"),
  ];
  for (const scope of scopes) {
    candidates.push(...artifacts.map((artifact) => join(scope, artifact)));
    for (const entry of await readdir(scope, { withFileTypes: true })) {
      if (entry.name.endsWith(".tsbuildinfo") && (entry.isFile() || entry.isSymbolicLink()))
        candidates.push(join(scope, entry.name));
    }
  }

  const cleaned: string[] = [];
  for (const path of candidates.sort()) {
    if (!(await hasLocalParents(directory, path)) || !(await stat(path))) continue;
    if (!dryRun) await rm(path, { recursive: true, force: true });
    cleaned.push(relative(directory, path).replaceAll("\\", "/"));
  }
  return cleaned;
}
