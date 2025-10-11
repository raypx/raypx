// Re-export commonly used Drizzle utilities

export type { InferInsertModel, InferSelectModel } from "drizzle-orm";
export {
  and,
  eq,
  gt,
  gte,
  ilike,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
export { databaseRegistry } from "./registry";
export * as schemas from "./schemas";
// Re-export package internals
export * from "./types";
export * from "./utils";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { envs } from "./envs";
import { databaseRegistry } from "./registry";
import type * as schemas from "./schemas";

/**
 * Database client type - PostgreSQL database with full schema
 */
export type Database = PostgresJsDatabase<typeof schemas>;

/**
 * Cached database instance
 */
let _cachedDb: Database | null = null;

/**
 * Get database client instance (singleton pattern)
 * Lazily initializes based on DATABASE_PROVIDER environment variable
 *
 * @returns Promise<Database> - Drizzle database client
 */
export const getDatabase = async (): Promise<Database> => {
  if (!_cachedDb) {
    const env = envs();
    _cachedDb = (await databaseRegistry.get(env.DATABASE_PROVIDER)) as Database;
  }
  return _cachedDb;
};

/**
 * Reset cached database instance (useful for testing)
 */
export const resetDatabase = () => {
  _cachedDb = null;
};
