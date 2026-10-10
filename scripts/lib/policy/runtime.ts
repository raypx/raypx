import { execFileSync, spawnSync } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const artifacts = new Set([
  ".git",
  "node_modules",
  "dist",
  ".output",
  ".tanstack",
  ".vite",
  ".vite-temp",
  ".nitro",
  "coverage",
  ".vitest",
  "storybook-static",
  "playwright-report",
  "test-results",
  ".ci-reports",
]);

function firstParty(path: string): boolean {
  return !path.split("/").some((segment) => artifacts.has(segment) || segment.startsWith(".env"));
}

function localPath(root: string, path: string): string | undefined {
  const absolute = resolve(root, path);
  const difference = relative(root, absolute);
  return isAbsolute(difference) || difference === ".." || difference.startsWith(`..${sep}`)
    ? undefined
    : absolute;
}

async function localRealPath(root: string, path: string): Promise<string | undefined> {
  const absolute = localPath(root, path);
  if (!absolute) return undefined;
  try {
    const actual = await realpath(absolute);
    return localPath(root, relative(root, actual));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export interface PolicyRepository {
  root: string;
  files: ReadonlySet<string>;
  workspaceDirectories: string[];
  read(path: string): Promise<string | undefined>;
  exists(path: string): Promise<boolean>;
}

/** Git supplies tracked and non-ignored untracked content; no recursive dependency scans. */
export async function policyRepository(root: string): Promise<PolicyRepository> {
  const directory = await realpath(root);
  const options = {
    cwd: directory,
    encoding: "utf8" as const,
    maxBuffer: 8 * 1024 * 1024,
    stdio: "pipe" as const,
  };
  const files = new Set(
    execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], options)
      .split("\0")
      .filter((file) => file && firstParty(file)),
  );
  const workspaceDirectories: string[] = [];
  for (const group of ["apps", "packages"]) {
    const parent = join(directory, group);
    let entries;
    try {
      if (!(await lstat(parent)).isDirectory()) continue;
      entries = await readdir(parent, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    const candidates = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${group}/${entry.name}`);
    const ignored = new Set<string>();
    if (candidates.length) {
      const result = spawnSync("git", ["check-ignore", "-z", "--stdin", "--no-index"], {
        ...options,
        input: candidates.join("\0") + "\0",
        stdio: ["pipe", "pipe", "ignore"],
      });
      if (result.error || (result.status !== 0 && result.status !== 1))
        throw new Error("Could not inspect Git ignore rules.");
      for (const path of result.stdout.split("\0")) if (path) ignored.add(path);
    }
    workspaceDirectories.push(...candidates.filter((candidate) => !ignored.has(candidate)));
  }
  const contents = new Map<string, string | undefined>();
  return {
    root: directory,
    files,
    workspaceDirectories: workspaceDirectories.sort(),
    async read(path) {
      if (!files.has(path) || !firstParty(path)) return undefined;
      if (contents.has(path)) return contents.get(path);
      const actual = await localRealPath(directory, path);
      const content = actual ? await readFile(actual, "utf8") : undefined;
      contents.set(path, content);
      return content;
    },
    async exists(path) {
      return (await localRealPath(directory, path)) !== undefined;
    },
  };
}
