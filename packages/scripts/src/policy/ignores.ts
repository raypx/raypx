import { findingFor } from "./findings.js";
import type { PolicyFinding } from "./checks.js";

/** A workspace pattern that matches at any depth instead of at the workspace root. */
const anchorFinding = findingFor("ignore.anchor");

/** A workspace pattern the root `.gitignore` already applies everywhere. */
const duplicateFinding = findingFor("ignore.duplicate");

/**
 * Extracts the effective patterns from a `.gitignore`, dropping comments and
 * blank lines. Negations are kept, because a workspace repeating one is still
 * repeating the root. Pure.
 */
export function parseIgnorePatterns(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * True when git resolves the pattern against the directory holding the
 * `.gitignore` rather than against every directory beneath it. Git anchors a
 * pattern as soon as it contains a slash anywhere but the end, so this is git's
 * rule restated, not a convention of ours.
 */
function anchored(pattern: string): boolean {
  const name = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
  return name.includes("/");
}

/**
 * True when the pattern names a shape rather than a path, such as `*.log`.
 * Anchoring one would change what it means, so the anchor rule leaves it alone.
 */
function locationIndependent(pattern: string): boolean {
  return /[*?[]/.test(pattern);
}

type IgnoreVerdict = "duplicate" | "keep" | "unanchored";

/**
 * Judges one pattern. The validator and the fixer both read this, so a pattern
 * cannot be reported by one and left alone by the other.
 *
 * A duplicate outranks an unanchored pattern because deleting it settles both,
 * and reporting both would be two findings with one remedy.
 */
function classify(pattern: string, root: ReadonlySet<string>): IgnoreVerdict {
  if (root.has(pattern)) return "duplicate";
  if (pattern.startsWith("!") || anchored(pattern) || locationIndependent(pattern)) return "keep";
  return "unanchored";
}

/**
 * Validates one workspace `.gitignore` against the layering the root file
 * documents: the root owns location-independent patterns, a workspace owns the
 * output it produces, and a workspace pattern must be anchored.
 *
 * An unanchored pattern is the expensive failure. `logs` in a TanStack Start app
 * silently makes a `src/routes/logs/` route uncommittable — `bun run dev` keeps
 * working locally while the route is absent from the build everyone else gets.
 *
 * Duplicates are compared as exact text. Deciding that a workspace `/coverage/`
 * is already covered by the root's per-app coverage glob would mean
 * reimplementing git's matcher; a missed duplicate costs one redundant line,
 * while a wrong duplicate claim costs trust in the whole checker. Pure.
 *
 * @param rootPatterns patterns parsed from the repository-root `.gitignore`
 */
export function validateWorkspaceIgnore(
  location: string,
  content: string,
  rootPatterns: readonly string[],
): PolicyFinding[] {
  const root = new Set(rootPatterns);
  return parseIgnorePatterns(content).flatMap((pattern) => {
    switch (classify(pattern, root)) {
      case "duplicate":
        return [
          duplicateFinding(
            location,
            `repeats ${pattern} from the root .gitignore`,
            `delete ${pattern} from ${location}; the root already applies it everywhere`,
          ),
        ];
      case "unanchored":
        return [
          anchorFinding(
            location,
            `${pattern} is not anchored to the workspace root`,
            `write /${pattern} in ${location} so it cannot match a nested source directory`,
          ),
        ];
      case "keep":
        return [];
    }
  });
}

/**
 * Rewrites a workspace `.gitignore` so it satisfies both rules: an unanchored
 * pattern gains its leading slash, and a pattern the root already applies is
 * dropped. Comments, blank lines, and order survive, and every line the validator
 * accepts is returned byte-identical. Pure.
 */
export function fixWorkspaceIgnore(content: string, rootPatterns: readonly string[]): string {
  const root = new Set(rootPatterns);

  return content
    .split("\n")
    .flatMap((line) => {
      const pattern = line.trim();
      if (pattern.length === 0 || pattern.startsWith("#")) return [line];
      switch (classify(pattern, root)) {
        // Dropping the line rather than commenting it out: the root still applies
        // the pattern, so there is nothing left to explain here.
        case "duplicate":
          return [];
        case "unanchored":
          return [`/${pattern}`];
        case "keep":
          return [line];
      }
    })
    .join("\n");
}
