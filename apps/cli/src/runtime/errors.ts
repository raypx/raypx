export class LocalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function errorPayload(error: unknown) {
  return {
    code: error instanceof LocalError ? error.code : "LOCAL_ERROR",
    message: error instanceof LocalError ? error.message : "Local operation failed",
  };
}
