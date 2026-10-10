/** Public diagnostic outcomes; skipped checks are never presented as verified. */
export type DoctorStatus = "ok" | "warning" | "error" | "skipped";

/** A fixed diagnostic result with no configured values or raw exceptions. */
export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  code: string;
  message: string;
  fix?: string;
  fields?: readonly string[];
}

/** Versioned report used by text/JSON clients and automation. */
export interface DoctorReport {
  schemaVersion: 1;
  status: DoctorStatus;
  checks: readonly DoctorCheck[];
}

/** Explicit repository and environment inputs; active probes are opt-in. */
export interface DoctorOptions {
  root: string;
  environment?: Record<string, string | undefined>;
  database?: boolean;
  probe?: string;
}

/** Combines checks without treating skipped outcomes as verified. */
export function createDoctorReport(checks: readonly DoctorCheck[]): DoctorReport {
  const status = checks.some((check) => check.status === "error")
    ? "error"
    : checks.some((check) => check.status === "warning")
      ? "warning"
      : "ok";
  return { schemaVersion: 1, status, checks };
}

/** Formats one fixed diagnostic result for the human-readable CLI. */
export function formatDoctorCheck(check: DoctorCheck): string {
  return `${check.status.toUpperCase()} ${check.id}: ${check.message}${check.fields?.length ? ` Fields: ${check.fields.join(", ")}.` : ""}${check.fix ? ` ${check.fix}` : ""}`;
}

/** Creates the stable sanitized report for invalid usage or an internal CLI failure. */
export function doctorFailureReport(): DoctorReport {
  return {
    schemaVersion: 1,
    status: "error",
    checks: [
      {
        id: "doctor",
        status: "error",
        code: "DOCTOR_USAGE_OR_INTERNAL_ERROR",
        message: "Doctor could not run. Use --json, --database, or --probe with an HTTP(S) origin.",
      },
    ],
  };
}

/** Maps a completed diagnostic report to its stable process exit code. */
export function doctorExitCode(report: DoctorReport): 0 | 1 {
  return report.status === "error" ? 1 : 0;
}
