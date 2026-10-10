import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

interface SQLiteConnection {
  query(sql: string): { all(): unknown[] };
  close(): void;
}

interface SQLiteModule {
  Database: new (
    path: string,
    options: { readonly: true; create: false; strict: true },
  ) => SQLiteConnection;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Checks an existing SQLite file through a read-only connection; returns only a fixed diagnostic code. */
export function inspectDatabase(root: string, path: string): string {
  if (!existsSync(path)) return "DATABASE_MISSING";
  const { Database } = createRequire(import.meta.url)("bun:sqlite") as SQLiteModule;
  const connection = new Database(path, { readonly: true, create: false, strict: true });
  try {
    const expected = ["user", "session", "account", "verification"];
    const tables = connection
      .query("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => record(row).name);
    if (!expected.every((table) => tables.includes(table))) return "DATABASE_SCHEMA_MISSING";
    try {
      // LIMIT 0 compiles the expected auth columns without reading account data.
      for (const statement of [
        "SELECT id, name, email, email_verified, image, created_at, updated_at FROM user LIMIT 0",
        "SELECT id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id FROM session LIMIT 0",
        "SELECT id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at FROM account LIMIT 0",
        "SELECT id, identifier, value, expires_at, created_at, updated_at FROM verification LIMIT 0",
      ])
        connection.query(statement).all();
    } catch {
      return "DATABASE_SCHEMA_MISSING";
    }
    if (!tables.includes("__drizzle_migrations")) return "DATABASE_MIGRATIONS_PENDING";
    const journal = record(
      JSON.parse(
        readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"),
      ) as unknown,
    );
    if (!Array.isArray(journal.entries)) throw new Error("Invalid journal");
    const hashes = connection
      .query("SELECT hash FROM __drizzle_migrations")
      .all()
      .map((row) => record(row).hash);
    for (const entry of journal.entries) {
      const tag = record(entry).tag;
      if (typeof tag !== "string" || !/^\d+_[A-Za-z0-9_-]+$/.test(tag))
        throw new Error("Invalid migration tag");
      const migration = readFileSync(join(root, "packages/db/migrations", `${tag}.sql`));
      if (!hashes.includes(createHash("sha256").update(migration).digest("hex")))
        return "DATABASE_MIGRATIONS_PENDING";
    }
    return "DATABASE_READY";
  } finally {
    connection.close();
  }
}
