/**
 * Drizzle Kit configuration for main database
 *
 * Usage:
 *   drizzle-kit generate --config=config/drizzle.config.ts
 *   drizzle-kit push --config=config/drizzle.config.ts
 *   drizzle-kit migrate --config=config/drizzle.config.ts
 *
 * Note: Environment variables are loaded by raypx-scripts CLI before this config is read
 */

import assert from "node:assert/strict";
import type { Config } from "drizzle-kit";
import { loadDatabaseUrl } from "./utils";

const databaseUrl = loadDatabaseUrl("DATABASE_URL");
assert(databaseUrl, "Missing DATABASE_URL environment variable");

const config: Config = {
  // Main database schemas (pg subdirectory)
  // Vector schemas are in schemas/vector/ and handled by drizzle-vector.config.ts
  schema: "./src/schemas/pg/**/*.ts",
  out: "./migrations/pg",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
};

export default config;
