import path from "node:path";
import { defineConfig, env } from "prisma/config";

console.log("env", env("DATABASE_URL"));

export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
