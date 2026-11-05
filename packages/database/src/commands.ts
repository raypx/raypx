import { getDatabaseEnv } from "./env.ts";
import { migrateDatabase } from "./migrate.ts";

if (process.argv[2] !== "migrate") throw new Error("Usage: tsx src/commands.ts migrate");
await migrateDatabase(getDatabaseEnv().DATABASE_URL);
