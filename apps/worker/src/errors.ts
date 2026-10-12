export const cloudFailureCodes = [
  "MODEL_UNAVAILABLE",
  "SEARCH_UNAVAILABLE",
  "STORAGE_UNAVAILABLE",
  "DOCUMENT_RENDERER_UNAVAILABLE",
  "SOURCE_EVIDENCE_INVALID",
  "BUDGET_EXCEEDED",
  "EXECUTION_FAILED",
] as const;
export type CloudFailureCode = (typeof cloudFailureCodes)[number];
export class CloudExecutionError extends Error {
  constructor(
    public readonly code: CloudFailureCode,
    message: string = code,
  ) {
    super(message);
    this.name = "CloudExecutionError";
  }
}
/** A public Run failure never contains an upstream error message or request. */
export function publicFailureCode(error: unknown): CloudFailureCode {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (typeof code === "string" && cloudFailureCodes.includes(code as CloudFailureCode))
    return code as CloudFailureCode;
  if (code === "CLOUD_BUDGET_EXCEEDED" || code === "CLOUD_QUOTA_EXCEEDED") return "BUDGET_EXCEEDED";
  return "EXECUTION_FAILED";
}
