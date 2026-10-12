import type { ApiProblemDetails } from "@voidmix/contracts";

const titles: Record<string, string> = {
  BAD_REQUEST: "Bad request",
  UNAUTHORIZED: "Authentication required",
  FORBIDDEN: "Access denied",
  NOT_FOUND: "Resource not found",
  CONFLICT: "Conflict",
  SERVICE_UNAVAILABLE: "Service unavailable",
  INTERNAL_SERVER_ERROR: "Internal server error",
};

export function createProblemDetails(
  code: string,
  status: number,
  requestId: string,
  values: Record<string, string | number | boolean | null> = {},
): ApiProblemDetails {
  return {
    type: `https://api.voidmix.dev/problems/${encodeURIComponent(code)}`,
    title: titles[code] ?? "Request failed",
    status,
    code,
    values,
    fieldErrors: [],
    requestId,
  };
}

export function problemContentType(response: Response): Response {
  response.headers.set("Content-Type", "application/problem+json");
  return response;
}
