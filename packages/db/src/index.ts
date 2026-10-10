import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { createLogger } from "@raypx/logger";
import { schema } from "./schema.js";

const logger = createLogger({ name: "database" });
const require = createRequire(import.meta.url);

/** SQLite database with the application's authentication schema and relations. */
export type RaypxDatabase = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

export interface DatabaseOptions {
  /** Maximum SQLite lock wait, in milliseconds. Defaults to 5000. */
  busyTimeoutMs?: number;
}

/** Explicitly owned connection; the application is responsible for closing it. */
export interface DatabaseConnection {
  readonly db: RaypxDatabase;
  checkHealth(): void;
  close(): void;
}

/**
 * Opens an independent SQLite connection without applying migrations.
 *
 * Creates file parent directories and enables foreign keys and WAL. In-memory
 * SQLite keeps its native memory journal. Importing this package opens nothing.
 *
 * @param path - SQLite file path or `:memory:`
 * @param options - Connection lock timeout
 * @returns A typed database and its health check and idempotent disposer
 */
export function createDatabase(path: string, options: DatabaseOptions = {}): DatabaseConnection {
  if (typeof path !== "string" || !path.trim())
    throw new Error("Database path must be a non-empty string");
  const timeout = options.busyTimeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 2_147_483_647)
    throw new Error("Database busyTimeoutMs must be an integer from 0 to 2147483647");
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });

  const connection = process.versions.bun
    ? createBunConnection(path, timeout)
    : createNodeConnection(path, timeout);
  let closed = false;
  logger.info("Database connection established");
  return {
    db: connection.db,
    checkHealth() {
      connection.db.get(sql`SELECT 1`);
    },
    close() {
      if (closed) return;
      connection.close();
      closed = true;
      logger.info("Database connection closed");
    },
  };
}

function createNodeConnection(path: string, timeout: number) {
  const sqlite = new Database(path, { timeout });
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

function createBunConnection(path: string, timeout: number) {
  // Resolve Bun builtins only inside Bun so importing this package in Node works.
  const { Database: BunDatabase } = require("bun:sqlite") as typeof import("bun:sqlite");
  const { drizzle: bunDrizzle } =
    require("drizzle-orm/bun-sqlite") as typeof import("drizzle-orm/bun-sqlite");
  const sqlite = new BunDatabase(path, { create: true, strict: true });
  try {
    // timeout is checked above before interpolating its integer value.
    sqlite.exec(`PRAGMA busy_timeout = ${timeout}`);
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
    return { db: bunDrizzle(sqlite, { schema }), close: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

let defaultConnection: DatabaseConnection | undefined;

/**
 * Lazily opens a compatibility singleton. The first path is used until closed.
 * Prefer `createDatabase` for explicit application lifecycle ownership.
 */
export function getDatabase(path = "./data/raypx.db"): RaypxDatabase {
  defaultConnection ??= createDatabase(path);
  return defaultConnection.db;
}

/** Closes the compatibility singleton and permits a later fresh connection. */
export function closeDatabase(): void {
  defaultConnection?.close();
  defaultConnection = undefined;
}

export { runMigrations } from "./migrate.js";
export type { MigrationOptions } from "./migrate.js";
export { withTransaction } from "./transaction.js";
export type { DatabaseTransaction } from "./transaction.js";
export type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
export * from "drizzle-orm";
