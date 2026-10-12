import { apiProblemDetailsSchema, type ApiProblemDetails } from "@voidmix/contracts";

/** Parse an RFC 9457 problem body returned by the API or embedded in an oRPC error. */
export function parseApiProblemDetails(value: unknown): ApiProblemDetails | null {
  const candidate =
    value && typeof value === "object" && "data" in value
      ? (value as { data?: unknown }).data
      : value;
  const problem =
    candidate && typeof candidate === "object" && "problem" in candidate
      ? (candidate as { problem?: unknown }).problem
      : candidate;
  const parsed = apiProblemDetailsSchema.safeParse(problem);
  return parsed.success ? parsed.data : null;
}
