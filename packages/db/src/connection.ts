import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { relations } from "./schema.js";
export function connectDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  let closed: Promise<void> | undefined;
  return { db: drizzle({ client, relations }), close: () => (closed ??= client.end()) };
}
export type DatabaseConnection = ReturnType<typeof connectDatabase>;
export type Database = DatabaseConnection["db"];
export async function migrateDatabase(
  databaseUrl: string,
  migrationsFolder = fileURLToPath(new URL("../drizzle-foundation", import.meta.url)),
): Promise<void> {
  const connection = connectDatabase(databaseUrl);
  try {
    await migrate(connection.db, {
      migrationsFolder,
      migrationsSchema: "raypx_foundation_migrations",
    });
  } finally {
    await connection.close();
  }
}
