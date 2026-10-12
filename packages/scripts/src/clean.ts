import { lstat, readdir, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";

const rootArtifacts = [
  ".cache",
  ".tanstack",
  ".vite",
  ".vite-plus",
  ".turbo",
  "coverage",
  "node_modules/.cache",
  "node_modules/.nitro",
  "node_modules/.vite",
  "playwright-report",
  "test-results",
] as const;

const workspaceArtifacts = [
  ".cache",
  ".nitro",
  ".output",
  ".storage",
  ".tanstack",
  ".vite",
  ".turbo",
  "coverage",
  "dist",
  "node_modules/.cache",
  "node_modules/.nitro",
  "node_modules/.vite",
  "playwright-report",
  "storybook-static",
  "test-results",
] as const;

const artifactFilePatterns = [
  /\.lcov$/,
  /\.tgz$/,
  /\.tsbuildinfo$/,
  /^report\.\d+\.\d+\.\d+\.\d+\.json$/,
] as const;

export interface CleanRepositoryOptions {
  dependencies?: boolean;
}

export async function cleanRepository(
  repositoryRoot: string,
  options: CleanRepositoryOptions = {},
): Promise<string[]> {
  const workspaceRoots = await findWorkspaceRoots(repositoryRoot);
  const artifactFiles = (
    await Promise.all(
      [repositoryRoot, ...workspaceRoots].map((directory) => findArtifactFiles(directory)),
    )
  ).flat();
  const candidates = [
    ...rootArtifacts.map((path) => join(repositoryRoot, path)),
    ...workspaceRoots.flatMap((workspaceRoot) =>
      workspaceArtifacts
        .filter(
          (path) => !(path === "dist" && workspaceRoot === join(repositoryRoot, "packages/shared")),
        )
        .map((path) => join(workspaceRoot, path)),
    ),
    join(repositoryRoot, "apps/desktop/src-tauri/target"),
    join(repositoryRoot, "apps/desktop/src-tauri/gen/schemas"),
    ...artifactFiles,
    ...(options.dependencies
      ? [
          ...workspaceRoots.flatMap((workspaceRoot) => [
            join(workspaceRoot, "node_modules"),
            join(workspaceRoot, "node_modules.bun"),
          ]),
          join(repositoryRoot, "node_modules"),
          join(repositoryRoot, "node_modules.bun"),
        ]
      : []),
  ];
  const removed: string[] = [];

  for (const path of candidates) {
    if (!(await pathExists(path))) continue;
    await rm(path, { force: true, recursive: true });
    removed.push(path.slice(repositoryRoot.length + 1));
  }

  const tauriGeneratedRoot = join(repositoryRoot, "apps/desktop/src-tauri/gen");
  try {
    await rmdir(tauriGeneratedRoot);
    removed.push(tauriGeneratedRoot.slice(repositoryRoot.length + 1));
  } catch (error) {
    if (!isMissingPathError(error) && !isDirectoryNotEmptyError(error)) throw error;
  }

  return removed;
}

async function findArtifactFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw error;
  }

  return entries
    .filter(
      (entry) => entry.isFile() && artifactFilePatterns.some((pattern) => pattern.test(entry.name)),
    )
    .map((entry) => join(directory, entry.name));
}

async function findWorkspaceRoots(repositoryRoot: string): Promise<string[]> {
  const roots = [join(repositoryRoot, "e2e")];

  for (const parent of ["apps", "packages"] as const) {
    const parentPath = join(repositoryRoot, parent);
    let entries;
    try {
      entries = await readdir(parentPath, { withFileTypes: true });
    } catch (error) {
      if (isMissingPathError(error)) continue;
      throw error;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) roots.push(join(parentPath, entry.name));
    }
  }

  return roots;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isDirectoryNotEmptyError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOTEMPTY";
}
