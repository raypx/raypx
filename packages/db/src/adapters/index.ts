import type { DatabaseConfig } from "../types";

/**
 * Common adapter configuration interface
 */
export interface AdapterFactory<TClient> {
  createClient: <TSchema extends Record<string, unknown>>(
    config: DatabaseConfig<TSchema>,
  ) => TClient;
}

/**
 * Shared Drizzle client configuration options
 */
export const DRIZZLE_CONFIG = {
  casing: "snake_case" as const,
  logger: process.env.NODE_ENV === "development",
};
