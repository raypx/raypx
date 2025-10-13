import { reset, seed } from "drizzle-seed";
import { getDatabase } from "./src";
import * as schemas from "./src/schemas";

async function main() {
  const db = await getDatabase();
  await reset(db, schemas);
  await seed(db, schemas, {
    count: 100,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
