import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { DatabaseConfig } from "../types";
import { DRIZZLE_CONFIG } from "./index";

const POSTGRES_CONFIG = {
  prepare: true,
  keep_alive: 1000,
  debug: process.env.NODE_ENV === "development",
} as const;

export const createClient = <TSchema extends Record<string, unknown>>({
  databaseUrl,
  schema,
}: DatabaseConfig<TSchema>) => {
  const client = postgres(databaseUrl, POSTGRES_CONFIG);
  return drizzle(client, {
    schema,
    ...DRIZZLE_CONFIG,
  });
};
