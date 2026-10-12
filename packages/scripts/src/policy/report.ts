import type { PolicyReport } from "./checks.js";

export function renderPolicyReport(report: PolicyReport): string {
  if (report.findings.length === 0) {
    return "Policy: no findings.";
  }

  const lines: string[] = [];
  for (const finding of report.findings) {
    lines.push(`[${finding.severity}] ${finding.check} ${finding.location}: ${finding.message}`);
    lines.push(`  Fix: ${finding.fix}`);
  }
  lines.push(`Policy: ${report.errors} errors, ${report.warnings} warnings.`);
  return lines.join("\n");
}
