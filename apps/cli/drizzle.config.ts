import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/runtime/sqlite/schema.ts",
  out: "./drizzle",
});
