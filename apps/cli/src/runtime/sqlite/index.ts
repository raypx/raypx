import type { SQLQueryBindings } from "bun:sqlite";
import type { Query } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";

export { drizzle };
export type LocalDatabase = ReturnType<typeof drizzle>;

/** Drizzle has no streaming SQLite iterator. A dedicated native cursor keeps
 * interleaved snapshot readers bounded and independent. Only select unaliased
 * plain text columns here: native iteration bypasses Drizzle's result mapping. */
export function* iterateRows<T extends Record<string, unknown>>(
  database: LocalDatabase,
  query: { toSQL(): Query; _: { result: T[] } },
): Generator<T, void, unknown> {
  const { sql, params } = query.toSQL();
  const statement = database.$client.prepare<T, SQLQueryBindings[]>(sql);
  try {
    // Drizzle encodes SQLite bindings, but its shared Query type uses unknown[].
    yield* statement.iterate(...(params as SQLQueryBindings[]));
  } finally {
    statement.finalize();
  }
}
