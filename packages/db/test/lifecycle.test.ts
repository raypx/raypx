import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, expect, test } from "vite-plus/test";
import { closeDatabase, getDatabase } from "../src/index.js";

const directories: string[] = [];

afterEach(() => {
  closeDatabase();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("closing releases the SQLite connection and permits a fresh database", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-db-"));
  directories.push(directory);
  const first = getDatabase(join(directory, "first.db"));
  expect(getDatabase()).toBe(first);
  expect(first.get(sql`SELECT 1 AS value`)).toEqual({ value: 1 });
  closeDatabase();
  expect(() => first.get(sql`SELECT 1`)).toThrow(/not open|closed/i);
  const second = getDatabase(join(directory, "second.db"));
  expect(second).not.toBe(first);
  expect(second.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 });
});

test("closing before initialization and closing twice are harmless", () => {
  expect(() => {
    closeDatabase();
    closeDatabase();
  }).not.toThrow();
});
