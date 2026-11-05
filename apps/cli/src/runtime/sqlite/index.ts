import type { SQLInputValue as SQLQueryBindings } from "node:sqlite";
import type { Query } from "drizzle-orm";
import { drizzle } from "./database.ts";

export { drizzle };
export { migrateLocalDatabase } from "./migrate.ts";
export { ProfileStorage } from "./profile.ts";
export type LocalDatabase = ReturnType<typeof drizzle>;

/** Drizzle has no streaming SQLite iterator. A dedicated native cursor keeps
 * interleaved snapshot readers bounded and independent. Only select unaliased
 * plain text columns here: native iteration bypasses Drizzle's result mapping. */
export function* iterateRows<T extends Record<string, unknown>>(
  database: LocalDatabase,
  query: { toSQL(): Query; _: { result: T[] } },
): Generator<T, void, unknown> {
  const { sql, params } = query.toSQL();
  const statement = database.$client.prepare(sql);
  const cursor = statement.iterate(...(params as SQLQueryBindings[]));
  try {
    for (const row of cursor) yield row as T;
  } finally {
    cursor.return?.();
  }
}
