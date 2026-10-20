import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectDatabase } from "./connection.js";

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
