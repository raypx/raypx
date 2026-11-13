import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { relations } from "./schema.js";

export interface DatabaseOptions {
  max?: number;
  fetchTypes?: boolean;
  /**
   * Server-side bound for one statement. Request-serving pools set it below their
   * request deadline so an abandoned query frees its connection; migrations omit it.
   */
  statementTimeoutMs?: number;
  /** Server-side bound for a transaction that stops sending statements. */
  idleTransactionTimeoutMs?: number;
}
export function connectDatabase(databaseUrl: string, options: DatabaseOptions = {}) {
  const client = postgres(databaseUrl, {
    max: options.max ?? 10,
    connection: {
      search_path: "public",
      ...(options.statementTimeoutMs === undefined
        ? {}
        : { statement_timeout: options.statementTimeoutMs }),
      ...(options.idleTransactionTimeoutMs === undefined
        ? {}
        : { idle_in_transaction_session_timeout: options.idleTransactionTimeoutMs }),
    },
    ...(options.fetchTypes === undefined ? {} : { fetch_types: options.fetchTypes }),
  });
  let closed: Promise<void> | undefined;
  return { db: drizzle({ client, relations }), close: () => (closed ??= client.end()) };
}
export type DatabaseConnection = ReturnType<typeof connectDatabase>;
export type Database = DatabaseConnection["db"];

/** Dedicated process-owned LISTEN connection; callers choose a channel and bounded payload. */
export function connectDatabaseNotifications(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1, fetch_types: false });
  let closed: Promise<void> | undefined;
  return {
    async listen(channel: string, receive: (payload: string) => void) {
      const subscription = await client.listen(channel, receive);
      return async () => {
        await subscription.unlisten();
      };
    },
    close: () => (closed ??= client.end()),
  };
}
