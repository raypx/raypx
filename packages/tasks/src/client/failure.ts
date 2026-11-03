const failureCodes = [
  "AI_INVALID_CONFIG",
  "PI_RECOVERY_REQUIRED",
  "PI_CONTEXT_CONFLICT",
  "PI_CONTEXT_TRANSFER_REQUIRED",
  "AI_AUTH_REQUIRED",
  "AI_MODEL_NOT_FOUND",
  "AI_NOT_CONFIGURED",
  "UNSUPPORTED_CAPABILITY",

  "CONTEXT_NOT_FOUND",
  "CONTEXT_ARCHIVED",
  "CONTEXT_PROJECT_MISMATCH",
  "CONTEXT_TOO_LARGE",
  "CONTEXT_UNAVAILABLE",
  "CONTEXT_REQUEST_EXPIRED",
  "UPGRADE_REQUIRED",
  "LOCAL_UNAVAILABLE",
  "DEVICE_OFFLINE",
  "PROJECT_BUSY",
  "AGENT_UNAVAILABLE",
  "REQUEST_EXPIRED",
  "ALREADY_RESOLVED",
  "REQUEST_CLOSED",
  "DEVICE_REVOKED",
  "SESSION_UNAVAILABLE",
  "RATE_LIMITED",
  "TASK_NOT_READY",
  "TASK_STOPPED",
  "INPUT_WAITING_APPROVAL",
  "INPUT_QUEUE_FULL",
  "INPUT_IN_PROGRESS",
] as const;
export function failureCode(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const code = (error as { data?: { error?: { code?: string } } }).data?.error?.code;
    const known = failureCodes.find((item) => item === code);
    if (known) return known;
  }
  return "NETWORK_UNAVAILABLE" as const;
}
