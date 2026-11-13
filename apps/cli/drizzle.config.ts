import type { Config } from "@raypx/drizzle-kit";

export default {
  dialect: "sqlite",
  schema: "./src/runtime/sqlite/schema.ts",
  out: "./drizzle",
} satisfies Config;
