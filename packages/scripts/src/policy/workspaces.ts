import { findingFor, collectFindings } from "./findings.js";
import type { PolicyFinding } from "./checks.js";

const shapeHeading = /^##\s+Repository shape\b.*$/m;

/** A workspace listing disagrees with what Bun resolves. */
const listingFinding = findingFor("workspace.listing");

/** A directory exists that is not, and cannot be, a workspace. */
const directoryFinding = findingFor("workspace.directory");

/**
 * Reports directories under the workspace globs that hold no `package.json`.
 * Such a directory is not a workspace, so nothing builds, checks, or tests it —
 * but an agent reading the filesystem still sees it and infers that code belongs
 * there. Pure.
 *
 * @param candidates every directory matched by a workspace glob
 * @param members the subset Bun actually resolves as workspaces
 */
export function findNonWorkspaceDirectories(
  candidates: readonly string[],
  members: readonly string[],
): PolicyFinding[] {
  const resolved = new Set(members);
  return candidates
    .filter((candidate) => !resolved.has(candidate))
    .map((candidate) =>
      directoryFinding(
        candidate,
        "is matched by a workspace glob but has no package.json",
        `give ${candidate} a package.json, or remove it: rm -rf ${candidate}`,
      ),
    );
}

/**
 * Reports directories that contain no files at any depth. Git cannot track an
 * empty directory, so one is always a local artifact: nobody cloning the
 * repository sees it, yet an agent reading the filesystem does and infers that
 * code belongs there. Pure.
 *
 * @param empty repository-relative directories already known to hold no files
 */
export function findEmptyDirectories(empty: readonly string[]): PolicyFinding[] {
  return empty.map((directory) =>
    directoryFinding(
      directory,
      "contains no files at any depth, so it exists only in this working tree",
      `remove it: rm -rf ${directory}`,
    ),
  );
}

/**
 * Extracts the workspace names listed in the root AGENTS.md "Repository shape"
 * fence. Each line is `<group>  <name, name, …>  <comment>`, columns separated
 * by two or more spaces. Pure.
 */
export function parseDeclaredWorkspaces(rootAgents: string): string[] {
  const heading = shapeHeading.exec(rootAgents);
  if (!heading) return [];

  const afterHeading = rootAgents.slice(heading.index + heading[0].length);
  const fence = /```[a-z]*\n([\s\S]*?)```/.exec(afterHeading);
  if (!fence?.[1]) return [];

  const names = new Set<string>();
  for (const line of fence[1].split("\n")) {
    const columns = line.trim().split(/\s{2,}/);
    const listed = columns[1];
    if (!listed) continue;
    for (const name of listed.split(",")) {
      const trimmed = name.trim();
      if (trimmed.length > 0) names.add(trimmed);
    }
  }
  return [...names];
}

const workspacePath = /^(?:apps|packages)\/[a-z0-9-]+$|^e2e$/;

/**
 * Extracts workspace paths from a fenced `<path>  <description>` listing under
 * the given heading — the shape README.md uses, which differs from the grouped
 * form in AGENTS.md. Lines whose first column is not a workspace path are
 * ignored, so prose and blank lines inside the fence are harmless. Pure.
 */
export function parseListedWorkspacePaths(content: string, heading: string): string[] {
  const match = new RegExp(`^##\\s+${heading}\\b.*$`, "m").exec(content);
  if (!match) return [];

  const fence = /```[a-z]*\n([\s\S]*?)```/.exec(content.slice(match.index + match[0].length));
  if (!fence?.[1]) return [];

  return [
    ...new Set(
      fence[1]
        .split("\n")
        // Split on any whitespace run, not on aligned columns: a row padded with
        // a single space would otherwise parse as one long token, fail the path
        // test, and vanish from the check as a silent pass.
        .map((line) => line.trim().split(/\s+/)[0] ?? "")
        .filter((candidate) => workspacePath.test(candidate)),
    ),
  ];
}

/**
 * Compares a `<path>  <description>` workspace listing against the resolved
 * members. The repository keeps such a listing in README.md as well as the
 * grouped one in AGENTS.md; an unchecked second copy drifts, which is how
 * `apps/worker` outlived the directory. Pure.
 */
export function validateListedWorkspacePaths(
  location: string,
  listed: readonly string[],
  members: readonly string[],
): PolicyFinding[] {
  const resolved = new Set(members);
  const declared = new Set(listed);

  return [
    ...listed
      .filter((path) => !resolved.has(path))
      .map((path) =>
        listingFinding(
          location,
          `lists ${path}, which is not a workspace`,
          `remove ${path} from the listing in ${location}`,
        ),
      ),
    ...members
      .filter((member) => !declared.has(member))
      .map((member) =>
        listingFinding(
          location,
          `does not list ${member}`,
          `add ${member} to the listing in ${location}`,
        ),
      ),
  ];
}

/**
 * Compares the workspaces Bun actually resolves against the ones the root
 * AGENTS.md claims, in both directions. A hardcoded list nothing checks always
 * drifts; this is that check. Pure.
 *
 * @param members repository-relative workspace directories, e.g. `packages/db`
 */
export function validateWorkspaceInventory(
  members: readonly string[],
  rootAgents: string,
): PolicyFinding[] {
  const { findings, report } = collectFindings(listingFinding);
  const declared = new Set(parseDeclaredWorkspaces(rootAgents));

  if (declared.size === 0) {
    return [
      listingFinding(
        "AGENTS.md",
        "the Repository shape fence lists no workspaces",
        'keep a "## Repository shape" section whose fenced block lists workspace names',
      ),
    ];
  }

  const actual = new Map(members.map((member) => [member.split("/").pop() ?? member, member]));

  for (const [name, member] of actual) {
    if (!declared.has(name)) {
      report(
        "AGENTS.md",
        `workspace ${member} is not listed in Repository shape`,
        `add ${name} to the matching group in the Repository shape fence`,
      );
    }
  }

  for (const name of declared) {
    if (!actual.has(name)) {
      report(
        "AGENTS.md",
        `Repository shape lists ${name}, which is not a workspace`,
        `remove ${name} from the Repository shape fence, or give it a package.json`,
      );
    }
  }

  return findings;
}
