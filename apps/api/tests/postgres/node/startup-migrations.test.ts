import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { sql } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 3 });
const migrations = fileURLToPath(
  new URL("../../../../../packages/database/drizzle-foundation", import.meta.url),
);
const command = fileURLToPath(
  new URL("../../../../../packages/database/src/commands.ts", import.meta.url),
);
afterAll(() => connection.close());

function worker() {
  const child = Bun.spawn([process.execPath, "--no-env-file", command, "migrate"], {
    env: { ...process.env, DATABASE_URL: url! },
    stdout: "pipe",
    stderr: "pipe",
  });
  return Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).then(([code]) => code);
}

it("serializes independent migration processes and does not reapply committed history", async () => {
  expect(await Promise.all([worker(), worker(), worker()])).toEqual([0, 0, 0]);
  const expected = (await readdir(migrations)).sort();
  const rows = await connection.db.execute<{ name: string }>(sql`
    select name from raypx_foundation_migrations.__drizzle_migrations order by name
  `);
  expect(rows.map((row) => row.name)).toEqual(expected);
  await migrateDatabase(url);
  const count = await connection.db.execute<{ count: number }>(sql`
    select count(*)::integer as count from raypx_foundation_migrations.__drizzle_migrations
  `);
  expect(count[0]!.count).toBe(expected.length);
});

it("waits for another migrator's transaction before reading migration history", async () => {
  const locked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const holder = connection.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('raypx_foundation_migrations'), 0)`);
    locked.resolve();
    await release.promise;
  });
  await locked.promise;
  const migrating = worker();
  try {
    const deadline = Date.now() + 10_000;
    let waiting = false;
    while (Date.now() < deadline) {
      const rows = await connection.db.execute<{ waiting: boolean }>(sql`
        select exists(
          select 1 from pg_locks
          where locktype = 'advisory' and not granted
            and classid = hashtext('raypx_foundation_migrations')::oid and objid = 0
            and database = (select oid from pg_database where datname = current_database())
        ) as waiting
      `);
      if (rows[0]!.waiting) {
        waiting = true;
        break;
      }
      await Bun.sleep(20);
    }
    expect(waiting).toBe(true);
  } finally {
    release.resolve();
    await holder;
    expect(await migrating).toBe(0);
  }
});

it("rolls back a failed migration and releases its lock for a subsequent startup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-failed-migration-"));
  const table = `startup_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await cp(migrations, directory, { recursive: true });
    const folder = join(directory, "20990101000000_failure_fixture");
    await mkdir(folder);
    await writeFile(
      join(folder, "migration.sql"),
      `CREATE TABLE raypx_foundation.${table} (id integer);\n--> statement-breakpoint\nSELECT 1 / 0;`,
    );
    await expect(migrateDatabase(url, directory)).rejects.toThrow("1 / 0");
    const rows = await connection.db.execute<{ name: string | null }>(sql`
      select to_regclass(${`raypx_foundation.${table}`})::text as name
    `);
    expect(rows[0]!.name).toBeNull();
    expect(await worker()).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
