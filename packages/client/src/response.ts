import { MalformedResponseError } from "@orpc/client";

/** Distinguish a missing RPC route from an application-level NOT_FOUND. */
export function isMissingProcedure(error: unknown): boolean {
  return error instanceof MalformedResponseError && error.response.status === 404;
}
