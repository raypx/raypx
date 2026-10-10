import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import {
  createDatabase,
  eq,
  runMigrations,
  sql,
  withTransaction,
  type DatabaseConnection,
} from "../src/index.js";
import { account, session, user, verification } from "../src/schema.js";

const connections: DatabaseConnection[] = [];
const directories: string[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function database() {
  const connection = createDatabase(":memory:");
  connections.push(connection);
  runMigrations(connection.db);
  return connection.db;
}

test("opening never migrates; explicit migrations are repeatable without losing rows", () => {
  const connection = createDatabase(":memory:");
  connections.push(connection);
  expect(() => connection.db.select().from(user).all()).toThrow(/no such table/i);
  runMigrations(connection.db);
  connection.db
    .insert(user)
    .values({ id: "first", name: "First", email: "first@example.com" })
    .run();
  runMigrations(connection.db);
  expect(connection.db.select().from(user).all()).toHaveLength(1);
  expect(
    connection.db.get<{ count: number }>(sql`SELECT count(*) AS count FROM __drizzle_migrations`),
  ).toEqual({ count: 1 });
});

test("file connections create their directory, retain data after close, and enable SQLite constraints", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-foundation-"));
  directories.push(directory);
  const path = join(directory, "nested", "database.db");
  const first = createDatabase(path, { busyTimeoutMs: 1200 });
  connections.push(first);
  expect(existsSync(path)).toBe(true);
  runMigrations(first.db);
  first.db.insert(user).values({ id: "saved", name: "Saved", email: "saved@example.com" }).run();
  expect(first.db.get(sql`PRAGMA journal_mode`)).toEqual({ journal_mode: "wal" });
  expect(first.db.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 });
  expect(first.db.get(sql`PRAGMA busy_timeout`)).toEqual({ timeout: 1200 });
  first.checkHealth();
  first.close();
  first.close();
  expect(() => first.checkHealth()).toThrow(/not open|closed/i);
  const second = createDatabase(path);
  connections.push(second);
  expect(second.db.select().from(user).get()?.id).toBe("saved");
});

test("independent connections do not share data or close one another", () => {
  const first = database();
  const second = database();
  first.insert(user).values({ id: "one", name: "One", email: "one@example.com" }).run();
  expect(second.select().from(user).all()).toEqual([]);
  connections[0]?.close();
  expect(() => connections[1]?.checkHealth()).not.toThrow();
});

test("auth schema enforces unique identifiers, foreign keys, cascades, and millisecond dates", () => {
  const db = database();
  const date = new Date("2026-01-02T03:04:05.678Z");
  db.insert(user)
    .values({ id: "owner", name: "Owner", email: "owner@example.com", createdAt: date })
    .run();
  expect(db.select().from(user).get()?.createdAt).toEqual(date);
  expect(db.select().from(user).get()?.emailVerified).toBe(false);
  expect(() =>
    db.insert(user).values({ id: "other", name: "Other", email: "owner@example.com" }).run(),
  ).toThrow(/unique/i);
  expect(() =>
    db
      .insert(session)
      .values({ id: "orphan", token: "orphan-token", userId: "missing", expiresAt: date })
      .run(),
  ).toThrow(/foreign key/i);
  db.insert(session)
    .values({ id: "session", token: "unique-token", userId: "owner", expiresAt: date })
    .run();
  expect(() =>
    db
      .insert(session)
      .values({ id: "duplicate", token: "unique-token", userId: "owner", expiresAt: date })
      .run(),
  ).toThrow(/unique/i);
  db.insert(account)
    .values({
      id: "credential",
      accountId: "owner",
      providerId: "credential",
      userId: "owner",
      password: "hash",
    })
    .run();
  db.insert(verification)
    .values({
      id: "verification",
      identifier: "owner@example.com",
      value: "verification-value",
      expiresAt: date,
    })
    .run();
  expect(
    db.query.user.findFirst({ with: { sessions: true, accounts: true } }).sync()?.sessions,
  ).toHaveLength(1);
  db.delete(user).where(eq(user.id, "owner")).run();
  expect(db.select().from(session).all()).toEqual([]);
  expect(db.select().from(account).all()).toEqual([]);
  expect(db.select().from(verification).all()).toHaveLength(1);
});

test("transaction failure rolls back all earlier writes while success returns its value", () => {
  const db = database();
  expect(() =>
    withTransaction(db, (tx) => {
      tx.insert(user)
        .values({ id: "rollback", name: "Rollback", email: "rollback@example.com" })
        .run();
      tx.insert(session)
        .values({ id: "bad", userId: "missing", token: "bad", expiresAt: new Date() })
        .run();
    }),
  ).toThrow(/foreign key/i);
  expect(db.select().from(user).all()).toEqual([]);
  const id = withTransaction(db, (tx) => {
    tx.insert(user).values({ id: "commit", name: "Commit", email: "commit@example.com" }).run();
    return "commit";
  });
  expect(id).toBe("commit");
  expect(db.select().from(user).get()?.id).toBe("commit");
});

test("nested transactions roll back their savepoint while preserving outer work", () => {
  const db = database();
  withTransaction(db, (tx) => {
    tx.insert(user).values({ id: "outer", name: "Outer", email: "outer@example.com" }).run();
    expect(() =>
      tx.transaction((nested) => {
        nested
          .insert(user)
          .values({ id: "inner", name: "Inner", email: "inner@example.com" })
          .run();
        throw new Error("rollback savepoint");
      }),
    ).toThrow("rollback savepoint");
    tx.insert(user).values({ id: "after", name: "After", email: "after@example.com" }).run();
  });
  expect(db.select({ id: user.id }).from(user).orderBy(user.id).all()).toEqual([
    { id: "after" },
    { id: "outer" },
  ]);
});

test("async callbacks are rejected before executing and Promise results roll back writes", () => {
  const db = database();
  let called = false;
  expect(() => {
    // @ts-expect-error SQLite callbacks must return synchronous values.
    void withTransaction(db, async () => {
      called = true;
    });
  }).toThrow(/synchronous/);
  expect(called).toBe(false);
  expect(() => {
    // @ts-expect-error A non-async callback must not return a Promise either.
    void withTransaction(db, (tx) => {
      tx.insert(user)
        .values({ id: "promise", name: "Promise", email: "promise@example.com" })
        .run();
      return Promise.resolve("value");
    });
  }).toThrow(/Promise/);
  expect(db.select().from(user).all()).toEqual([]);
});

test("connection configuration rejects empty paths and invalid lock timeouts", () => {
  expect(() => createDatabase(" ")).toThrow(/path/);
  for (const busyTimeoutMs of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => createDatabase(":memory:", { busyTimeoutMs })).toThrow(/busyTimeoutMs/);
});
