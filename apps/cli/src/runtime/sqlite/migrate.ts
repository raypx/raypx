import { Database } from "bun:sqlite";
import { chmodSync } from "node:fs";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { LocalError } from "../errors";
import type { LocalDatabase } from "./index";
import migrations from "./migrations.generated.json";

type AppliedMigration = { name: string; created_at: number; hash: string };

/** Serialize the migrator's ledger read and transaction across independent processes. */
export function migrateLocalDatabase(database: LocalDatabase) {
  const client = database.$client;
  const lock = new Database(`${client.filename}.migration-lock.sqlite`, { create: true });
  try {
    if (process.platform !== "win32") chmodSync(lock.filename, 0o600);
    lock.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
    client.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    const unsupported = () => {
      throw new LocalError("UNSUPPORTED_SCHEMA", "This profile uses an unsupported SQLite schema");
    };
    const version = client.query<{ user_version: number }, []>("PRAGMA user_version").get();
    if (version?.user_version !== 0) unsupported();
    const objects = client
      .query<{ name: string }, []>("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")
      .all();
    const managed = objects.some((object) => object.name === "__drizzle_migrations");
    if (!managed && objects.length) unsupported();
    const journal = migrations;
    if (managed) {
      // Reject retired Drizzle ledgers before migrate() can automatically upgrade them.
      const columns = client
        .query<{ name: string }, []>("PRAGMA table_info('__drizzle_migrations')")
        .all();
      if (columns.map((column) => column.name).join(",") !== "id,hash,created_at,name,applied_at")
        unsupported();
      const applied = client
        .query<AppliedMigration, []>(
          "SELECT name, created_at, hash FROM __drizzle_migrations ORDER BY id",
        )
        .all();
      if (!applied.length && objects.length !== 1) unsupported();
      if (
        applied.some((entry, index) => {
          const expected = journal[index];
          return (
            !expected ||
            entry.name !== expected.name ||
            entry.created_at !== expected.timestamp ||
            entry.hash !== ""
          );
        })
      )
        unsupported();
    }
    migrate(database, { migrationsJournal: journal });
  } finally {
    lock.close();
  }
}
