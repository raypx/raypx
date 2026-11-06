import { spawnSync } from "node:child_process";
import { join } from "node:path";

type Issue = { file: string; [category: string]: unknown };
/** Validate the native report without rewriting package-manager findings. */
export function knipFindings(report: unknown): Issue[] {
  if (
    !report ||
    typeof report !== "object" ||
    !("issues" in report) ||
    !Array.isArray(report.issues)
  )
    throw new Error("Invalid Knip JSON report");
  return report.issues.flatMap((value: unknown) => {
    if (!value || typeof value !== "object" || !("file" in value) || typeof value.file !== "string")
      throw new Error("Invalid Knip issue");
    const issue = value as Issue;
    for (const [category, findings] of Object.entries(issue))
      if (category !== "file" && !Array.isArray(findings))
        throw new Error(`Invalid Knip category: ${category}`);
    return Object.entries(issue).some(
      ([key, categoryFindings]) => key !== "file" && (categoryFindings as unknown[]).length,
    )
      ? [issue]
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
  const findings = knipFindings(report);
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
