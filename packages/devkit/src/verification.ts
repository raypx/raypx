import { execFileSync } from "node:child_process";

export function changedFiles(
  root: string,
  base = "origin/canary",
  ci?: { before?: string; head?: string },
) {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    const from = ci?.before ?? git(["merge-base", base, "HEAD"]).trim();
    if (!from || /^0+$/.test(from)) throw new Error("Missing base");
    const values = [git(["diff", "--name-only", "-z", "--no-renames", from, ci?.head ?? "HEAD"])];
    if (!ci)
      values.push(
        git(["diff", "--name-only", "-z", "--no-renames", "HEAD"]),
        git(["ls-files", "--others", "--exclude-standard", "-z"]),
      );
    return {
      files: [...new Set(values.flatMap((value) => value.split("\0").filter(Boolean)))].sort(),
      reasons: [] as string[],
    };
  } catch {
    return {
      files: [] as string[],
      reasons: ["Git base or changed paths unavailable; running full verification"],
    };
  }
}

export interface AffectedMember {
  name: string;
  dependencies: string[];
}
export interface AffectedPolicy<M, S> {
  merge(previous: S | undefined, next: S): S;
  propagate(scope: S, source: M, consumer: M): S | undefined;
}
/** A monotonic scope policy reaches a fixed point, including development dependencies. */
export function affectedWorkspaces<M extends AffectedMember, S>(
  members: M[],
  seeds: ReadonlyMap<string, S>,
  policy: AffectedPolicy<M, S>,
): Map<string, S> {
  const byName = new Map(members.map((member) => [member.name, member]));
  const affected = new Map<string, S>();
  for (const [name, scope] of seeds) {
    if (!byName.has(name)) throw new Error(`Unknown affected workspace: ${name}`);
    affected.set(name, scope);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const consumer of members)
      for (const name of consumer.dependencies) {
        const source = byName.get(name),
          scope = affected.get(name);
        if (!source || scope === undefined) continue;
        const next = policy.propagate(scope, source, consumer);
        if (next === undefined) continue;
        const previous = affected.get(consumer.name),
          merged = policy.merge(previous, next);
        if (merged !== previous) {
          affected.set(consumer.name, merged);
          changed = true;
        }
      }
  }
  return affected;
}
