import type { RaypxDatabase } from "./index.js";

export type DatabaseTransaction = Parameters<Parameters<RaypxDatabase["transaction"]>[0]>[0];

type SynchronousResult<T> = T & (T extends PromiseLike<unknown> ? never : unknown);

/**
 * Runs synchronous SQLite writes atomically, rolling back when the callback throws.
 *
 * Use `.run()`, `.get()`, and `.all()` inside the callback. Never await or start
 * asynchronous work there: better-sqlite3 commits when the callback returns.
 * Nested `transaction.transaction(...)` calls use SQLite savepoints.
 */
export function withTransaction<T>(
  database: RaypxDatabase,
  callback: (transaction: DatabaseTransaction) => SynchronousResult<T>,
): T {
  if (Object.prototype.toString.call(callback) === "[object AsyncFunction]")
    throw new TypeError("SQLite transactions require a synchronous callback");
  return database.transaction((transaction) => {
    const result = callback(transaction);
    if (
      result !== null &&
      (typeof result === "object" || typeof result === "function") &&
      "then" in result &&
      typeof result.then === "function"
    )
      throw new TypeError("SQLite transactions cannot return a Promise");
    return result;
  });
}
