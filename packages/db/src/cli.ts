import { createDatabase } from "./index.js";
import { runMigrations } from "./migrate.js";

/** Applies package migrations to DATABASE_PATH without printing configuration. */
export function migrateFromEnvironment(input: Record<string, unknown>): void {
  const path = input.DATABASE_PATH;
  if (path !== undefined && (typeof path !== "string" || !path.trim()))
    throw new Error("Invalid database configuration");
  const connection = createDatabase(typeof path === "string" ? path : "./data/raypx.db");
  try {
    runMigrations(connection.db);
  } finally {
    connection.close();
  }
}

if (import.meta.main) {
  try {
    migrateFromEnvironment(process.env);
    console.log("Database migrations applied");
  } catch {
    console.error("Database migration failed. Check database configuration and migration assets.");
    process.exitCode = 1;
  }
}
