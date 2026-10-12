import type { I18nReport } from "./checks.js";

export function renderI18nReport(report: I18nReport): string {
  if (report.findings.length === 0) return "i18n: no findings.";

  const lines: string[] = [];
  for (const finding of report.findings) {
    lines.push(
      `[${finding.severity}] ${finding.check} ${finding.location}:${finding.line}:${finding.column}: ${finding.message}`,
    );
    lines.push(`  Fix: ${finding.fix}`);
  }
  lines.push(`i18n: ${report.errors} errors, ${report.warnings} warnings.`);
  return lines.join("\n");
}
