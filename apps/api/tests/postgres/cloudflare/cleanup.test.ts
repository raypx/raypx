import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { verification } from "@raypx/database/schema";
import { runWorkerSchedule } from "../../helpers/worker.js";
import { like } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 1 });
const prefix = `worker-cleanup-${crypto.randomUUID()}`;
beforeAll(() => migrateDatabase(url));
afterAll(async () => {
  try {
    await connection.db.delete(verification).where(like(verification.id, `${prefix}%`));
  } finally {
    await connection.close();
  }
});

describe.each(["direct", "hyperdrive"])("Worker cleanup (%s)", (mode) => {
  it("dispatches the built scheduled handler, removes expired data and preserves active data", async () => {
    const id = `${prefix}-${mode}`;
    await connection.db.insert(verification).values([
      {
        id: `${id}-expired`,
        identifier: id,
        value: "fixture",
        expiresAt: new Date(Date.now() - 2 * 86400_000),
      },
      {
        id: `${id}-active`,
        identifier: id,
        value: "fixture",
        expiresAt: new Date(Date.now() + 86400_000),
      },
    ]);
    await runWorkerSchedule(url, mode, "cleanup");
    const rows = await connection.db
      .select({ id: verification.id })
      .from(verification)
      .where(like(verification.id, `${id}%`));
    expect(rows).toEqual([{ id: `${id}-active` }]);
  }, 65000);
});
