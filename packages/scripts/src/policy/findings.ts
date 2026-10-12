import type { PolicyFinding, PolicySeverity } from "./checks.js";

export function findingFor(check: string, severity: PolicySeverity = "error") {
  return (location: string, message: string, fix: string): PolicyFinding => ({
    check,
    location,
    message,
    fix,
    severity,
  });
}

export function collectFindings(create: ReturnType<typeof findingFor>) {
  const findings: PolicyFinding[] = [];
  const report = (...args: Parameters<typeof create>) => {
    findings.push(create(...args));
  };
  return { findings, report };
}
