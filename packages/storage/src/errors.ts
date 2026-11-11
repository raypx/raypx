import type { StorageErrorCode } from "./types.js";

/** Messages are codes only, so driver URLs and responses never reach logs or clients. */
export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(code);
    this.name = "StorageError";
  }
}
