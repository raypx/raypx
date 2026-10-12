import { readdir, readFile, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { PolicyDependencies } from "./checks.js";
import { vendoredSkillRoot } from "./skills.js";
import { walkFiles, pathExists as exists } from "../runtime/files.js";
import { repositoryRoot } from "../runtime/repository.js";

/** Directories that never contain repository content. */
const skippedDirectories = new Set([
  ".git",
  ".output",
  ".vite",
  ".vite-plus",
  ".turbo",
  "coverage",
  "dist",
  "drizzle",
  "node_modules",
  "target",
  "test-results",
]);

/** Roots policy walks for markdown. Everything else is out of scope. */
const markdownRoots = ["docs", "skills", "apps", "packages", "e2e"] as const;

/** Root-level markdown files policy owns. */
const rootMarkdownFiles = ["AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "README.md"] as const;

const markdown = (name: string) => name.endsWith(".md");

/**
 * Expands Bun's workspace globs into directories. Only a directory with a
 * `package.json` is a workspace, so `requirePackageManifest` distinguishes real
 * members from directories that merely sit in the right place.
 */
async function expandWorkspaceGlobs(requirePackageManifest: boolean): Promise<string[]> {
  const manifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as {
    workspaces?: { packages?: string[] } | string[];
  };
  const patterns = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : (manifest.workspaces?.packages ?? []);

  const found: string[] = [];
  const accept = async (path: string) =>
    !requirePackageManifest || (await exists(join(repositoryRoot, path, "package.json")));

  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      if (await accept(pattern)) found.push(pattern);
      continue;
    }
    const parent = pattern.slice(0, -2);
    let entries;
    try {
      entries = await readdir(join(repositoryRoot, parent), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = `${parent}/${entry.name}`;
      if (await accept(candidate)) found.push(candidate);
    }
  }
  return found.sort();
}

const listWorkspaceMembers = () => expandWorkspaceGlobs(true);
const listWorkspaceCandidates = () => expandWorkspaceGlobs(false);

/**
 * Skill names with a real directory under `.agents/skills`. Symlinks are skipped:
 * the project skill is linked in from `skills/` and is not vendored.
 */
async function listVendoredSkills(): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(repositoryRoot, vendoredSkillRoot), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Walks the workspace roots and collects directories with no files beneath them.
 * Returns the shallowest such directory rather than every empty leaf, so a nested
 * chain reports once with the path that needs removing.
 */
async function listEmptyDirectories(): Promise<string[]> {
  const empty: string[] = [];

  // Returns true when `directory` contains at least one file at any depth.
  async function walk(directory: string): Promise<boolean> {
    let entries;
    try {
      entries = await readdir(join(repositoryRoot, directory), { withFileTypes: true });
    } catch {
      return true; // Unreadable: not our business to report.
    }

    let hasFile = false;
    const children: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip tool-owned directories and anything dot-prefixed. Git cannot
        // track an empty directory at all, so excluding these hides nothing that
        // could have been repository content.
        if (skippedDirectories.has(entry.name) || entry.name.startsWith(".")) {
          hasFile = true;
          continue;
        }
        children.push(join(directory, entry.name));
        continue;
      }
      hasFile = true;
    }

    const results = await Promise.all(children.map(walk));
    if (hasFile || results.some(Boolean)) {
      children.forEach((child, index) => {
        if (!results[index]) empty.push(child);
      });
      return true;
    }
    return false;
  }

  for (const root of ["apps", "packages"]) {
    if (!(await walk(root))) empty.push(root);
  }
  return empty.sort();
}

/**
 * Every file inside the resolved workspaces. Walking the members rather than a
 * hardcoded root list keeps this in step with the workspace globs, which is the
 * same reason the member listing is derived rather than declared.
 */
async function listWorkspaceFiles(): Promise<string[]> {
  const found: string[] = [];
  for (const member of await listWorkspaceMembers()) {
    await walkFiles(repositoryRoot, member, () => true, found, skippedDirectories);
  }
  return found.map((file) => file.split("\\").join("/")).sort();
}

async function listMarkdownFiles(): Promise<string[]> {
  const found: string[] = [];
  for (const file of rootMarkdownFiles) {
    if (await exists(join(repositoryRoot, file))) found.push(file);
  }
  for (const root of markdownRoots) {
    await walkFiles(repositoryRoot, root, markdown, found, skippedDirectories);
  }
  return found.map((file) => file.split("\\").join("/")).sort();
}

export function createPolicyDependencies(): PolicyDependencies {
  return {
    repositoryRoot,
    verifySkills: true,
    listEmptyDirectories,
    listMarkdownFiles,
    listVendoredSkills,
    listWorkspaceCandidates,
    listWorkspaceFiles,
    listWorkspaceMembers,
    pathExists: exists,
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, content) => writeFile(path, content, "utf8"),
    async readLink(path) {
      try {
        // The literal text matters, not where it resolves: an absolute or
        // over-deep relative target works on this machine and breaks in a clone.
        return await readlink(path);
      } catch {
        return null;
      }
    },
  };
}
