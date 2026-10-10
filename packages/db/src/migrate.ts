import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { RaypxDatabase } from "./index.js";
import type { schema } from "./schema.js";

export interface MigrationOptions {
  /** Optional application-owned migration directory; defaults to package assets. */
  migrationsFolder?: string;
}

/**
 * Applies checked-in migrations synchronously to an already opened database.
 *
 * Drizzle records applied migrations, so repeated calls do not recreate tables.
 * Package assets resolve relative to this module in both src and dist, regardless
 * of the application's working directory. This function never opens a database.
 */
export function runMigrations(database: RaypxDatabase, options: MigrationOptions = {}): void {
  // Both drivers use SQLiteSyncDialect.migrate; it ignores driver-specific run
  // results. The vendor signature narrows those results to Bun's void type.
  migrate(database as BunSQLiteDatabase<typeof schema>, {
    migrationsFolder:
      options.migrationsFolder ?? fileURLToPath(new URL("../migrations/", import.meta.url)),
  });
}
