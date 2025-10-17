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

import { createClient } from "./adapters/postgres";
import * as schemas from "./schemas";

export * as schemas from "./schemas";
export * from "./types";
export * from "./utils";

import { envs } from "./envs";

export const db = createClient<typeof schemas>({
  databaseUrl: envs().DATABASE_URL,
  schema: schemas,
});
