import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { mailConfiguration, storageConfiguration } from "@raypx/database/schema";
import { eq, sql } from "drizzle-orm";
import { databaseMailer } from "../../../src/config/resend.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 3 });
const migrations = fileURLToPath(
  new URL("../../../../../packages/database/drizzle-foundation", import.meta.url),
);
const command = fileURLToPath(new URL("../../../src/config/migrate.ts", import.meta.url));
afterAll(() => connection.close());

function worker(args: string[] = [], env: Record<string, string> = {}, stdin?: Uint8Array) {
  const child = Bun.spawn([process.execPath, "--no-env-file", command, ...args], {
    env: { ...env, DATABASE_URL: url! },
    stdin: stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
}

it("serializes independent migration processes and does not reapply committed history", async () => {
  const results = await Promise.all([worker(), worker(), worker()]);
  expect(results.map(([code]) => code)).toEqual([0, 0, 0]);
  const expected = (await readdir(migrations)).sort();
  const rows = await connection.db.execute<{ name: string }>(sql`
    select name from public.__drizzle_migrations order by name
  `);
  expect(rows.map((row) => row.name)).toEqual(expected);
  await migrateDatabase(url);
  const count = await connection.db.execute<{ count: number }>(sql`
    select count(*)::integer as count from public.__drizzle_migrations
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
    expect((await migrating)[0]).toBe(0);
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
      `CREATE TABLE public.${table} (id integer);\n--> statement-breakpoint\nSELECT 1 / 0;`,
    );
    await expect(migrateDatabase(url, directory)).rejects.toThrow("1 / 0");
    const rows = await connection.db.execute<{ name: string | null }>(sql`
      select to_regclass(${`public.${table}`})::text as name
    `);
    expect(rows[0]!.name).toBeNull();
    await writeFile(join(folder, "migration.sql"), `CREATE TABLE public.${table} (id integer);`);
    await expect(
      migrateDatabase(url, directory, async (tx) => {
        await tx.execute(
          sql`insert into ${sql.identifier("public")}.${sql.identifier(table)} values (1)`,
        );
        throw new Error("provider import failed");
      }),
    ).rejects.toThrow("provider import failed");
    const rolledBack = await connection.db.execute<{ name: string | null }>(sql`
      select to_regclass(${`public.${table}`})::text as name
    `);
    expect(rolledBack[0]!.name).toBeNull();
    expect((await worker())[0]).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("imports provider settings explicitly and preserves existing rows on retries", async () => {
  const secret = "synthetic-migration-secret-for-test-only";
  const env = {
    AUTH_SECRET: secret,
    RESEND_API_KEY: "re_migration_test_key",
    MAIL_FROM: "Raypx <notify@example.com>",
    MAIL_DEFAULT_LOCALE: "zh",
    S3_ENDPOINT: "https://s3.eu-central-1.amazonaws.com",
    S3_BUCKET: "raypx-migration-test",
    S3_ACCESS_KEY_ID: "fixture-access-key",
    S3_SECRET_ACCESS_KEY: "fixture-secret-key",
  };
  try {
    expect((await worker([], env))[0]).toBe(0);
    expect(await connection.db.select().from(mailConfiguration)).toEqual([]);
    expect(await connection.db.select().from(storageConfiguration)).toEqual([]);
    const [badCode, stdout, stderr] = await worker(["--import-config"], { ...env, S3_BUCKET: "" });
    expect(badCode).toBe(1);
    expect(stdout + stderr).not.toContain(env.RESEND_API_KEY);
    expect(await connection.db.select().from(mailConfiguration)).toEqual([]);
    const importResults = await Promise.all([
      worker(["--import-config"], env),
      worker([], { ...env, DB_MIGRATE_IMPORT_CONFIG: "true" }),
    ]);
    expect(importResults.map(([code]) => code)).toEqual([0, 0]);
    expect(await databaseMailer(connection.db, secret).available()).toBe(true);
    const [mail] = await connection.db.select().from(mailConfiguration);
    const [storage] = await connection.db.select().from(storageConfiguration);
    expect(mail).toMatchObject({ from: env.MAIL_FROM, defaultLocale: "zh", revision: 1 });
    expect(storage).toMatchObject({ bucket: env.S3_BUCKET, revision: 1 });
    expect(mail?.credentials).not.toContain(env.RESEND_API_KEY);
    expect(storage?.credentials).not.toContain(env.S3_SECRET_ACCESS_KEY);
    const retry = await worker(["--import-config"], { ...env, MAIL_FROM: "other@example.com" });
    expect(retry[0]).toBe(0);
    expect(await connection.db.select().from(mailConfiguration)).toEqual([mail]);
    expect(await connection.db.select().from(storageConfiguration)).toEqual([storage]);
    const custom = {
      endpoint: "https://storage.example.com",
      bucket: "raypx-private",
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    };
    const replace = await worker(
      ["--storage-stdin"],
      env,
      new TextEncoder().encode(JSON.stringify(custom)),
    );
    expect(replace[0]).toBe(0);
    expect(await connection.db.select().from(storageConfiguration)).toMatchObject([
      { endpoint: custom.endpoint, bucket: custom.bucket, revision: 2 },
    ]);
  } finally {
    await connection.db.delete(mailConfiguration).where(eq(mailConfiguration.id, "resend"));
    await connection.db.delete(storageConfiguration).where(eq(storageConfiguration.id, "s3"));
  }
});
