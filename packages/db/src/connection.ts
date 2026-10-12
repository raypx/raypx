import postgres, { type Sql } from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { relations } from "./schema.js";

export interface DatabaseConnection {
  db: PostgresJsDatabase;
  close(): Promise<void>;
}

export function connectDatabase(databaseUrl: string): DatabaseConnection {
  const client = postgres(databaseUrl, { max: 10 });
  return {
    db: drizzle({ client, relations }),
    close: () => client.end(),
  };
}

export async function migrateDatabase(
  databaseUrl: string,
  migrationsFolder = new URL("../drizzle-cloud", import.meta.url).pathname,
): Promise<void> {
  const client: Sql = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle({ client, relations }), { migrationsFolder });
  } finally {
    await client.end();
  }
}

// Drops every table and the drizzle migration bookkeeping, leaving an empty
// `public` schema for `db push` or a fresh `db migrate`. Callers own the
// development/test restriction.
export async function resetDatabase(databaseUrl: string): Promise<void> {
  const client: Sql = postgres(databaseUrl, { max: 1 });
  try {
    await client`drop schema if exists drizzle cascade`;
    await client`drop schema if exists public cascade`;
    await client`create schema public`;
  } finally {
    await client.end();
  }
}
