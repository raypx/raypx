import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Issue = { file: string; [category: string]: unknown };
type Manifest = {
  overrides?: Record<string, string>;
  workspaces?: {
    catalog?: Record<string, string>;
    catalogs?: Record<string, Record<string, string>>;
  };
};

/** Knip currently reads pnpm.overrides, but not Bun's root overrides. Keep its report read-only. */
export function knipFindings(report: unknown, manifest: Manifest): Issue[] {
  if (
    !report ||
    typeof report !== "object" ||
    !("issues" in report) ||
    !Array.isArray(report.issues)
  )
    throw new Error("Invalid Knip JSON report");
  const references = new Set<string>();
  for (const [name, value] of Object.entries(manifest.overrides ?? {})) {
    if (typeof value !== "string" || !value.startsWith("catalog:")) continue;
    const namespace = value.slice("catalog:".length);
    const catalog = namespace
      ? manifest.workspaces?.catalogs?.[namespace]
      : manifest.workspaces?.catalog;
    if (catalog?.[name]) references.add(`${namespace}:${name}`);
  }
  return report.issues.flatMap((value: unknown) => {
    if (!value || typeof value !== "object" || !("file" in value) || typeof value.file !== "string")
      throw new Error("Invalid Knip issue");
    const issue = value as Issue;
    const entries = Object.entries(issue).map(([category, findings]) => {
      if (category === "file") return [category, findings];
      if (!Array.isArray(findings)) throw new Error(`Invalid Knip category: ${category}`);
      if (category !== "catalog" || issue.file !== "package.json") return [category, findings];
      return [
        category,
        findings.filter(
          (finding: { namespace?: string; name?: string }) =>
            !finding ||
            typeof finding.namespace !== "string" ||
            typeof finding.name !== "string" ||
            !references.has(`${finding.namespace}:${finding.name}`),
        ),
      ];
    });
    const filtered = Object.fromEntries(entries) as Issue;
    return Object.entries(filtered).some(
      ([key, categoryFindings]) => key !== "file" && (categoryFindings as unknown[]).length,
    )
      ? [filtered]
      : [];
  });
}

export function checkKnip(root: string): void {
  const result = spawnSync(
    process.execPath,
    [join(root, "node_modules/knip/bin/knip.js"), "--reporter", "json"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.signal || (result.status !== 0 && result.status !== 1))
    throw new Error(`Knip failed (${result.signal ?? result.status}): ${result.stderr}`);
  const report = JSON.parse(result.stdout) as { issues: Issue[] };
  const findings = knipFindings(
    report,
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
  );
  if (result.stderr) process.stderr.write(result.stderr);
  if (findings.length) throw new Error(`Knip findings:\n${JSON.stringify(findings, null, 2)}`);
  // Never turn an unexplained failure into success, even when the report happens to be empty.
  if (
    result.status === 1 &&
    !report.issues.some((issue) =>
      Object.entries(issue).some(
        ([key, value]) => key !== "file" && Array.isArray(value) && value.length,
      ),
    )
  )
    throw new Error("Knip failed without reported findings");
  console.log("Knip passed");
}
