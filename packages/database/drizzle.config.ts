import type { Config } from "@raypx/drizzle-kit";
import { getDatabaseEnv } from "./src/env.js";

export default {
  dialect: "postgresql",
  schema: "./src/schema.ts",
  schemaFilter: ["public"],
  migrations: { schema: "public" },
  out: "./drizzle-foundation",
  dbCredentials: { url: getDatabaseEnv().DATABASE_URL },
} satisfies Config;
