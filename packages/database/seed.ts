import { createConsola } from "@raypx/shared/logger";
import { reset, seed } from "drizzle-seed";
import { db } from "./src";
import * as schemas from "./src/schemas/pg";

const logger = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4,
  formatOptions: {
    colors: true,
    date: false,
    compact: true,
  },
}).withTag("Database");

async function main() {
  await reset(db, schemas);
  await seed(db, schemas, {
    count: 100,
  });
}

main().catch((e) => {
  logger.error("Seed failed", { error: e });
  process.exit(1);
});
