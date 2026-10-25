import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectDatabase } from "./connection.js";

export async function migrateDatabase(
  databaseUrl: string,
  migrationsFolder = fileURLToPath(new URL("../drizzle-foundation", import.meta.url)),
): Promise<void> {
  const connection = connectDatabase(databaseUrl, { max: 1 });
  try {
    // Bound waiting for any operator-held table lock during the maintenance window.
    await connection.db.execute(sql`set lock_timeout = '10s'`);
    await migrate(connection.db, {
      migrationsFolder,
      migrationsSchema: "raypx_foundation_migrations",
    });
  } finally {
    await connection.close();
  }
}
