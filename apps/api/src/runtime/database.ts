import { connectDatabase } from "@raypx/database/connection";

/**
 * The RPC deadline is 15 s and drivers do not observe its abort signal. PostgreSQL
 * cancels the statement first, so a timed-out request returns its pooled connection
 * instead of holding it until the query finishes.
 */
const statementTimeoutMs = 12_000;
/** A transaction that stops sending statements must not pin a connection and its locks. */
const idleTransactionTimeoutMs = 30_000;

export function connectRuntimeDatabase(url: string) {
  return connectDatabase(url, { statementTimeoutMs, idleTransactionTimeoutMs });
}
