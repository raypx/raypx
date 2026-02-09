export type { InferInsertModel, InferSelectModel } from "drizzle-orm";
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";

import { createClient } from "./adapters/postgres";
import * as schemas from "./schemas/pg";
import * as vectorSchemas from "./schemas/vector";

export * as schemas from "./schemas/pg";
export * as vectorSchemas from "./schemas/vector";
export * from "./services/config";
export * from "./types";
export * from "./utils";

import { envs } from "./envs";

// Main database connection
export const db = createClient<typeof schemas>({
  databaseUrl: envs().DATABASE_URL,
  schema: schemas,
});

// Vector database connection (for embeddings and optionally chunks)
// Uses VECTOR_URL if set, otherwise falls back to DATABASE_URL (same database)
const env = envs();

const vectorUrl = env.VECTOR_URL || env.DATABASE_URL;

export const vectorDb = createClient<typeof vectorSchemas>({
  databaseUrl: vectorUrl,
  schema: vectorSchemas,
});
