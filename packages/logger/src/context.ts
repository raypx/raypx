import type { AuditableLogger } from "evlog";
import { createLoggerStorage } from "evlog/toolkit/storage";

const context = createLoggerStorage(
  "logger context. Wrap the operation in runWithLogger(logger, callback).",
  "@raypx/logger/context",
);

/** Run work with an existing logger; the caller retains ownership of emit(). */
export function runWithLogger<TResult>(
  logger: AuditableLogger<object>,
  callback: () => TResult,
): TResult {
  return context.storage.run(logger, callback);
}

export function getLogger<T extends object = Record<string, unknown>>():
  | AuditableLogger<T>
  | undefined {
  return context.storage.getStore() === undefined ? undefined : context.useLogger<T>();
}

export const useLogger = context.useLogger;
