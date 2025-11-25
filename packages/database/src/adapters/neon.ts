import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { DatabaseConfig } from "../types";
import { DRIZZLE_CONFIG } from "./index";

export const createClient = <TSchema extends Record<string, unknown>>({
  databaseUrl,
  schema,
}: DatabaseConfig<TSchema>) => {
  const sql = neon(databaseUrl);
  return drizzle({
    client: sql,
    schema,
    ...DRIZZLE_CONFIG,
  });
};
