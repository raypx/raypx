import { sql } from "drizzle-orm";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectDatabase, type Database } from "./connection.js";

type MigrationTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Safe to print: never retains driver errors, SQL, parameters, details or connection options. */
export class MigrationError extends Error {}

const recovery =
  "Stop this rollout. Verify the selected database and release. Restore the exact applied migration files from the deployed release, or restore a verified database backup into an isolated database. Reconcile intentional changes only after an operator reviews schema and history together. Do not delete ledger rows or reapply a baseline to an existing database.";

function migrationName(name: string | null) {
  return name && /^\d{14}_[\w-]+$/.test(name) ? name : "<invalid migration name>";
}

async function checkHistory(tx: MigrationTransaction, local: MigrationMeta[]) {
  const exists = await tx.execute<{ name: string | null }>(
    sql`select to_regclass('public.__drizzle_migrations')::text as name`,
  );
  if (!exists[0]?.name) return local;
  const columns = await tx.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = '__drizzle_migrations'
  `);
  if (!["name", "hash", "created_at"].every((name) => columns.some((c) => c.column_name === name)))
    throw new MigrationError(`Migration history differs: unsupported ledger columns. ${recovery}`);
  const applied = await tx.execute<{ name: string | null; hash: string; created_at: string }>(
    sql`select name, hash, created_at from public.__drizzle_migrations order by id`,
  );
  const differences: string[] = [];
  const names = new Set<string | null>();
  for (const row of applied) {
    const name = migrationName(row.name);
    const entry = local.find((m) => m.name === row.name);
    if (names.has(row.name)) differences.push(`${name}: duplicate applied entry`);
    names.add(row.name);
    if (!entry) {
      const renamed = local.find((m) => m.hash === row.hash);
      differences.push(
        renamed
          ? `${name}: applied file renamed to ${migrationName(renamed.name)}`
          : `${name}: applied file missing from release`,
      );
      continue;
    }
    if (entry.hash !== row.hash) differences.push(`${name}: checksum drift (applied SQL edited)`);
    if (String(entry.folderMillis) !== row.created_at)
      differences.push(`${name}: applied timestamp differs`);
  }
  const latest = Math.max(0, ...applied.map((row) => Number(row.created_at)));
  for (const entry of local) {
    if (!names.has(entry.name) && entry.folderMillis <= latest)
      differences.push(
        `${migrationName(entry.name)}: missing from applied history before a later entry`,
      );
  }
  if (differences.length)
    throw new MigrationError(`Migration history differs:\n${differences.join("\n")}\n${recovery}`);
  return local.filter((entry) => !names.has(entry.name));
}

function diagnostic(error: unknown, stage: string): MigrationError {
  if (error instanceof MigrationError) return error;
  let current = error;
  let code = "unavailable";
  let message = "Operation failed; inspect database availability and migration configuration.";
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const candidate = current as Error & { code?: string; cause?: unknown };
    if (candidate.code && /^[A-Z0-9_]{2,40}$/.test(candidate.code)) {
      code = candidate.code;
      // Primary server messages can contain supplied values too. Only these fixed
      // messages are safe; never print DETAIL, HINT, WHERE, SQL or driver metadata.
      const messages: Record<string, string> = {
        "22012": "division by zero",
        "42601": "syntax error in migration SQL",
        "42P01": "referenced relation does not exist",
        "42703": "referenced column does not exist",
        "42P07": "relation already exists; inspect schema and applied migration history",
        "42701": "column already exists; inspect schema and applied migration history",
        "23505": "unique constraint violation (values withheld)",
        "23503": "foreign key violation (values withheld)",
        "23502": "not-null constraint violation (values withheld)",
        "22P02": "invalid input representation (values withheld)",
        "42501": "insufficient database privileges",
        "28P01": "database authentication failed",
        "3D000": "selected database does not exist",
        "55P03":
          "lock wait timed out; another migrator or database writer holds the lock; retry after it finishes",
        "57014": "database operation cancelled",
        "53300": "database connection limit reached",
        ECONNREFUSED: "database connection refused",
        CONNECT_TIMEOUT: "database connection timed out",
        CONNECTION_CLOSED: "database connection closed",
        ENOTFOUND: "database host could not be resolved",
      };
      message =
        messages[code] ??
        "Database operation failed (server message withheld because it may contain data).";
    }
    current = candidate.cause;
  }
  return new MigrationError(
    `Database migration failed at ${stage}. SQLSTATE/code: ${code}. Message: ${message}`,
  );
}

export async function migrateDatabase(
  databaseUrl: string,
  migrationsFolder = fileURLToPath(new URL("../drizzle-foundation", import.meta.url)),
  afterSchema?: (tx: MigrationTransaction) => Promise<void>,
  options: { lockTimeoutMs?: number } = {},
): Promise<void> {
  let stage = "database connection / migration lock";
  let migrations: MigrationMeta[] = [];
  let statements: { name: string; statement: string }[] = [];
  let index = 0;
  let applying = false;
  const connection = connectDatabase(databaseUrl, {
    max: 1,
    suppressNotices: true,
    connectTimeoutSeconds: 5,
    onQuery(query) {
      // The pinned official migrator reads this ledger immediately before its
      // nested transaction executes the ordered pending statements. Ignore its
      // setup queries so repeated SQL still identifies the exact failing file.
      if (/^select id, hash, created_at, name from "public"\."__drizzle_migrations"$/.test(query)) {
        applying = true;
        return;
      }
      const next = statements[index];
      if (applying && next?.statement === query) {
        stage = migrationName(next.name);
        index++;
      }
    },
  });
  try {
    migrations = readMigrationFiles({ migrationsFolder });
    await connection.db.transaction(async (tx) => {
      // Hold one transaction/connection across Drizzle's ledger read and all DDL.
      // Startup instances and explicit migration jobs share this database-scoped lock.
      await tx.execute(
        sql`select set_config('lock_timeout', ${String(options.lockTimeoutMs ?? 120_000)}, true)`,
      );
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('raypx_foundation_migrations'), 0)`,
      );
      await tx.execute(sql`set local lock_timeout = '10s'`);
      stage = "migration history";
      const pending = await checkHistory(tx, migrations);
      statements = pending.flatMap((entry) =>
        entry.sql.map((statement) => ({ name: entry.name, statement })),
      );
      stage = "migration ledger / schema";
      await migrate(tx, {
        migrationsFolder,
        migrationsSchema: "public",
      });
      stage = "post-migration configuration";
      applying = false;
      await afterSchema?.(tx);
    });
  } catch (error) {
    throw diagnostic(error, stage);
  } finally {
    await connection.close();
  }
}
