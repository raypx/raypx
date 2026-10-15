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
    code: error instanceof LocalError ? error.code : "LOCAL_ERROR",
    message: error instanceof Error ? error.message : "Local operation failed",
  };
}
