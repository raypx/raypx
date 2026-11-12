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
/** Follows workspace dependents transitively, including development dependencies. */
export function affectedWorkspaces(members: AffectedMember[], seeds: ReadonlySet<string>) {
  const names = new Set(members.map((member) => member.name));
  for (const name of seeds)
    if (!names.has(name)) throw new Error(`Unknown affected workspace: ${name}`);
  const affected = new Set(seeds);
  for (let changed = true; changed;) {
    changed = false;
    for (const consumer of members) {
      if (affected.has(consumer.name) || !consumer.dependencies.some((name) => affected.has(name)))
        continue;
      affected.add(consumer.name);
      changed = true;
    }
  }
  return affected;
}
