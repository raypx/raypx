/**
 * Drizzle Kit configuration for vector database
 *
 * Supports two scenarios:
 * 1. Separate vector database (VECTOR_URL is set)
 * 2. Same database as main (falls back to DATABASE_URL)
 *
 * Usage:
 *   drizzle-kit generate --config=config/drizzle-vector.config.ts
 *   drizzle-kit push --config=config/drizzle-vector.config.ts
 *   drizzle-kit migrate --config=config/drizzle-vector.config.ts
 *
 * Note: Environment variables are loaded by raypx-scripts CLI before this config is read
 */

import assert from "node:assert/strict";
import type { Config } from "drizzle-kit";
import { loadDatabaseUrl } from "./utils";

// VECTOR_URL already falls back to DATABASE_URL in the schema
const vectorUrl = loadDatabaseUrl("VECTOR_URL");
assert(vectorUrl, "Missing DATABASE_URL environment variable");

const config: Config = {
  schema: "./src/schemas/vector/**/*.ts", // Vector-specific schemas
  out: "./migrations/vector", // Separate migration directory
  dialect: "postgresql",
  dbCredentials: {
    url: vectorUrl,
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
};

export default config;
