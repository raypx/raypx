import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Database client configuration
 */
export type DatabaseConfig<TSchema extends Record<string, unknown>> = {
  databaseUrl: string;
  schema: TSchema;
};

/**
 * Database client type
 */
export type DatabaseClient<TSchema extends Record<string, unknown> = Record<string, unknown>> =
  PostgresJsDatabase<TSchema>;
