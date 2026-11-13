import type { Config } from "@raypx/drizzle-kit";
import { getDatabaseEnv } from "./src/env.js";

export default {
  dialect: "postgresql",
  schema: "./src/schema.ts",
  schemaFilter: ["raypx_foundation"],
  out: "./drizzle-foundation",
  dbCredentials: { url: getDatabaseEnv().DATABASE_URL },
} satisfies Config;
