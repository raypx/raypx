const failureCodes = [
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
