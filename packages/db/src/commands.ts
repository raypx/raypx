import { getDatabaseEnv } from "./env.js";
import { migrateDatabase } from "./connection.js";
if (process.argv[2] !== "migrate") throw new Error("Usage: bun src/commands.ts migrate");
await migrateDatabase(getDatabaseEnv().DATABASE_URL);
