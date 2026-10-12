import { defineConfig } from "drizzle-kit";

import { getDatabaseEnv } from "./src/env.js";

const env = getDatabaseEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/cloud-baseline.ts",
  out: "./drizzle-cloud",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
