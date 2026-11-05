import { DatabaseSync as Database } from "node:sqlite";
import { chmodSync } from "node:fs";
import { LocalError } from "../errors.ts";
import type { LocalDatabase } from "./index.ts";
import migrations from "./migrations.generated.json";

type AppliedMigration = { name: string; created_at: number; hash: string };

/** Serialize the migrator's ledger read and transaction across independent processes. */
export function migrateLocalDatabase(database: LocalDatabase) {
  const client = database.$client;
  const lock = new Database(`${client.location()!}.migration-lock.sqlite`, {});
  try {
    if (process.platform !== "win32") chmodSync(lock.location()!, 0o600);
    lock.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
    client.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    const unsupported = () => {
      throw new LocalError("UNSUPPORTED_SCHEMA", "This profile uses an unsupported SQLite schema");
    };
    const version = client.prepare("PRAGMA user_version").get();
    if (version?.user_version !== 0) unsupported();
    const objects = client
      .prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")
      .all();
    const managed = objects.some((object) => object.name === "__drizzle_migrations");
    if (!managed && objects.length) unsupported();
    const journal = migrations;
    if (managed) {
      // Reject retired Drizzle ledgers before migrate() can automatically upgrade them.
      const columns = client.prepare("PRAGMA table_info('__drizzle_migrations')").all();
      if (columns.map((column) => column.name).join(",") !== "id,hash,created_at,name,applied_at")
        unsupported();
      const applied = client
        .prepare("SELECT name, created_at, hash FROM __drizzle_migrations ORDER BY id")
        .all() as unknown as AppliedMigration[];
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
    // Keep the existing Drizzle ledger byte-for-byte compatible. The Node driver
    // accepts filesystem migrations only; the standalone payload embeds this journal.
    client.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric, name text, applied_at TEXT
    )`);
    const count = Number(client.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get()!.n);
    client.exec("BEGIN");
    try {
      for (const entry of journal.slice(count)) {
        for (const sql of entry.sql.split("--> statement-breakpoint"))
          if (sql.trim()) client.exec(sql);
        client
          .prepare(
            "INSERT INTO __drizzle_migrations (hash, created_at, name, applied_at) VALUES (?, ?, ?, ?)",
          )
          .run("", entry.timestamp, entry.name, new Date().toISOString());
      }
      client.exec("COMMIT");
    } catch (error) {
      client.exec("ROLLBACK");
      throw error;
    }
  } finally {
    lock.close();
  }
}
