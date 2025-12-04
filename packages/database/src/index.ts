export type { InferInsertModel, InferSelectModel } from "drizzle-orm";
export {
  and,
  asc,
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

import { createClient } from "./adapters/neon";
import * as schemas from "./schemas";

export * as schemas from "./schemas";
export * from "./types";
export * from "./utils";

import { envs } from "./envs";

export const db = createClient<typeof schemas>({
  databaseUrl: envs().DATABASE_URL,
  schema: schemas,
});
