import { defineConfig } from "drizzle-kit";
import { getDatabaseEnv } from "./src/env.js";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  schemaFilter: ["raypx_foundation"],
  out: "./drizzle-foundation",
  dbCredentials: { url: getDatabaseEnv().DATABASE_URL },
});
