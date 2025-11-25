/**
 * Shared Drizzle client configuration options
 */
export const DRIZZLE_CONFIG = {
  casing: "snake_case" as const,
  logger: process.env.NODE_ENV === "development",
};
