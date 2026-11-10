import { InstanceError } from "@raypx/instances";
import { ContextError } from "@raypx/core/memory";

import { TaskContextError } from "@raypx/core/tasks";

export class LocalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function errorPayload(error: unknown) {
  return {
    code:
      error instanceof InstanceError ||
      error instanceof LocalError ||
      error instanceof ContextError ||
      error instanceof TaskContextError
        ? error.code
        : "LOCAL_ERROR",
    message:
      error instanceof ContextError || error instanceof TaskContextError
        ? error.code
        : error instanceof Error
          ? error.message
          : "Local operation failed",
  };
}
