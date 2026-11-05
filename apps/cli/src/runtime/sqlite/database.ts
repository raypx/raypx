import type { DatabaseSync } from "node:sqlite";
import { drizzle as nodeDrizzle } from "drizzle-orm/node-sqlite";

/** Synchronous nested domain writes share a transaction and use real savepoints. */
export function drizzle({ client }: { client: DatabaseSync }) {
  const database = nodeDrizzle({ client });
  const root = database.transaction.bind(database);
  type Transaction = Parameters<Parameters<typeof database.transaction>[0]>[0];
  let active: Transaction | undefined;
  database.transaction = (operation, configuration) => {
    const invoke = (transaction: Transaction) => {
      const parent = active;
      active = transaction;
      try {
        const result = operation(transaction);
        if (result && typeof result === "object" && "then" in result)
          throw new TypeError("SQLite transactions must be synchronous");
        return result;
      } finally {
        active = parent;
      }
    };
    return active ? active.transaction(invoke) : root(invoke, configuration);
  };
  return database;
}
