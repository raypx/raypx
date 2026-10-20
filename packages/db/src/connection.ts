import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { relations } from "./schema.js";

export interface DatabaseOptions {
  max?: number;
  fetchTypes?: boolean;
}
export function connectDatabase(databaseUrl: string, options: DatabaseOptions = {}) {
  const client = postgres(databaseUrl, {
    max: options.max ?? 10,
    ...(options.fetchTypes === undefined ? {} : { fetch_types: options.fetchTypes }),
  });
  let closed: Promise<void> | undefined;
  return { db: drizzle({ client, relations }), close: () => (closed ??= client.end()) };
}
export type DatabaseConnection = ReturnType<typeof connectDatabase>;
export type Database = DatabaseConnection["db"];
