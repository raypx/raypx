import { MalformedResponseError } from "@orpc/client";

/** Older API routers return a plain HTTP 404, outside the RPC error envelope. */
export function isMissingProcedure(error: unknown): boolean {
  return error instanceof MalformedResponseError && error.response.status === 404;
}
