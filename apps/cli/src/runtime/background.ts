import { errorPayload } from "./errors.ts";

/** A stable identifier for the failure: its domain code, else the error class. Never its message. */
function cause(error: unknown) {
  const { code } = errorPayload(error);
  if (code !== "LOCAL_ERROR") return code;
  return error instanceof Error ? error.name : code;
}

/**
 * Reports detached work that failed with nobody awaiting it. Messages may carry
 * paths, origins or provider output, so only the stable cause is written.
 */
export const backgroundFailure = (operation: string) => (error?: unknown) => {
  console.error(JSON.stringify({ operation, code: "BACKGROUND_FAILED", cause: cause(error) }));
};
