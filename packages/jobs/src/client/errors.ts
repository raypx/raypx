export const jobErrorCodes = [
  "INVALID_CRON",
  "JOB_CONFLICT",
  "CONFLICT",
  "JOB_NOT_FOUND",
  "NOT_FOUND",
  "JOBS_DISABLED",
  "JOB_BUSY",
  "ALREADY_RUNNING",
  "DEVICE_OFFLINE",
  "DEVICE_REVOKED",
  "DEVICE_EPOCH_MISMATCH",
  "PROJECT_UNAVAILABLE",
  "AGENT_UNAVAILABLE",
  "PROJECT_BUSY",
  "UNKNOWN_DELIVERY",
  "DELIVERY_UNKNOWN",
  "INVALID_JOB",
  "DELIVERY_EXPIRED",
  "DELIVERY_UNCERTAIN",
  "JOB_FAILED",
  "JOB_LIMIT",
  "IDEMPOTENCY_CONFLICT",
  "AUTH_REQUIRED",
  "RATE_LIMITED",
  "NETWORK_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "UPGRADE_REQUIRED",
  "MISSED_SCHEDULE",
  "HOST_RESTARTED",
  "DELIVERY_FAILED",
  "DEVICE_CHANGED",
  "DEVICE_REPLACED",
  "CONTROL_UNAVAILABLE",
  "AGENT_FAILED",
  "SERVER_UNAVAILABLE",
  "REQUEST_CLOSED",
  "REQUEST_TIMEOUT",
  "CONTEXT_NOT_FOUND",
  "CONTEXT_ARCHIVED",
  "CONTEXT_PROJECT_MISMATCH",
  "CONTEXT_TOO_LARGE",
  "CONTEXT_UNAVAILABLE",
  "CONTEXT_REQUEST_EXPIRED",
] as const;
export function jobFailure(error: unknown): (typeof jobErrorCodes)[number] {
  if (!error || typeof error !== "object") return "NETWORK_UNAVAILABLE";
  const value = error as { code?: unknown; data?: { error?: { code?: unknown } } };
  return (
    jobErrorCodes.find((code) => code === value.data?.error?.code || code === value.code) ??
    "NETWORK_UNAVAILABLE"
  );
}
export function jobReason(code: string | null) {
  return jobErrorCodes.find((known) => code === known) ?? "NETWORK_UNAVAILABLE";
}
