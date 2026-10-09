import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createLogger } from "@raypx/logger";

const logger = createLogger({ name: "database" });

/**
 * Database connection instance
 *
 * Lazy-initialized SQLite database using Drizzle ORM
 */
let db: BetterSQLite3Database | null = null;
let sqlite: Database.Database | null = null;

/**
 * Get or create the database connection
 *
 * @param path - Database file path (default: ./data/raypx.db)
 * @returns Drizzle database instance
 *
 * @example
 * ```typescript
 * import { getDatabase } from '@raypx/db';
 *
 * const db = getDatabase();
 * const users = await db.select().from(usersTable);
 * ```
 */
export function getDatabase(path = "./data/raypx.db"): BetterSQLite3Database {
  if (!db) {
    logger.info({ path }, "Initializing database connection");

    sqlite = new Database(path);
    sqlite.pragma("journal_mode = WAL"); // Enable Write-Ahead Logging
    sqlite.pragma("foreign_keys = ON"); // Enable foreign key constraints

    db = drizzle(sqlite);

    logger.info("Database connection established");
  }

  return db;
}

/**
 * Close the database connection
 *
 * @example
 * ```typescript
 * import { closeDatabase } from '@raypx/db';
 *
 * // On application shutdown
 * closeDatabase();
 * ```
 */
export function closeDatabase(): void {
  if (db) {
    logger.info("Closing database connection");
    sqlite?.close();
    sqlite = null;
    db = null;
  }
}

// Re-export Drizzle types for convenience
export type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
export * from "drizzle-orm";
