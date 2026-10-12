import type { DoctorReport } from "./checks.js";

export function renderDoctorReport(report: DoctorReport): string {
  const lines = report.checks.map((check) => `[${check.status}] ${check.name}: ${check.detail}`);
  lines.push(`Doctor: ${report.errors} errors, ${report.warnings} warnings.`);
  return lines.join("\n");
}
