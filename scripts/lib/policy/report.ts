export interface PolicyFinding {
  rule: string;
  path: string;
  message: string;
  fix: string;
}

export interface PolicyReport {
  findings: PolicyFinding[];
  errors: number;
}

export function policyReport(findings: PolicyFinding[]): PolicyReport {
  const unique = new Map(findings.map((finding) => [JSON.stringify(finding), finding]));
  const ordered = [...unique.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path, "en") ||
      left.rule.localeCompare(right.rule, "en") ||
      left.message.localeCompare(right.message, "en"),
  );
  return { findings: ordered, errors: ordered.length };
}

export function renderPolicyReport(report: PolicyReport): string {
  if (!report.errors) return "Repository policy passed.";
  return [
    ...report.findings.map(
      (finding) => `${finding.path} [${finding.rule}] ${finding.message}\n  Fix: ${finding.fix}`,
    ),
    `Repository policy failed with ${report.errors} findings.`,
  ].join("\n");
}
