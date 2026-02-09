import { createConsola } from "@raypx/shared/logger";

/**
 * Database-specific logger with [Database] tag
 */
const dbLogger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4, // info in prod, debug in dev
  formatOptions: {
    colors: true,
    date: false,
    compact: true,
  },
}).withTag("Database");

/**
 * Custom logger that filters out queries for vector tables
 * Vector tables (vector_embeddings, vector_chunks) can be very verbose
 */
const createFilteredLogger = () => {
  return {
    logQuery(query: string, params: unknown[]): void {
      // Filter out all vector table queries (vector_embeddings, vector_chunks, etc.)
      const queryLower = query.toLowerCase();
      const isVectorTableQuery = queryLower.includes("vector_");

      if (isVectorTableQuery) {
        // Skip logging for vector tables
        return;
      }

      // Log other queries using @raypx/shared/logger
      dbLogger.debug(query);
      if (params && params.length > 0) {
        dbLogger.debug("Params:", params);
      }
    },
  };
};

/**
 * Shared Drizzle client configuration options
 */
export const DRIZZLE_CONFIG = {
  casing: "snake_case" as const,
  logger: process.env.NODE_ENV === "development" ? createFilteredLogger() : false,
};
