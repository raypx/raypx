import type { ApiErrorCode, FieldErrors } from "@raypx/contracts/errors";

export type ApiClientErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "aborted"
  | "invalid-request"
  | "invalid-response";

export interface ApiClientErrorDetails {
  status?: number;
  code?: ApiErrorCode;
  requestId?: string;
  errors?: FieldErrors;
  cause?: unknown;
}

/** Typed failure with a safe public message and the original failure as cause. */
export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind;
  readonly status: number | undefined;
  readonly code: ApiErrorCode | undefined;
  readonly requestId: string | undefined;
  readonly errors: FieldErrors | undefined;

  constructor(kind: ApiClientErrorKind, message: string, details: ApiClientErrorDetails = {}) {
    super(message, { cause: details.cause });
    this.name =
      kind === "timeout" ? "TimeoutError" : kind === "aborted" ? "AbortError" : "ApiClientError";
    this.kind = kind;
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId;
    this.errors = details.errors;
  }
}
