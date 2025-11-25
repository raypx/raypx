import assert from "node:assert/strict";
import type { Config } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
assert(databaseUrl, "Missing DATABASE_URL");

const config: Config = {
  schema: "./src/schemas/**/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
};

export default config;
