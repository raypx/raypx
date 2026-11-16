import { readFile, readdir } from "node:fs/promises";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import * as definitions from "./schema.js";

const directory = new URL("../drizzle-foundation/", import.meta.url);

it("keeps the deployed baseline and covers the current public schema with generated migrations", async () => {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .map((entry) => {
      expect(entry.isDirectory()).toBe(true);
      expect(entry.name).toMatch(/^\d{14}_[\w-]+$/);
      return entry.name;
    })
    .sort();
  const [baseline, ...increments] = names;
  expect(baseline).toBe("20261115004545_baseline");
  expect(increments.length).toBeGreaterThan(0);
  let previousId = "00000000-0000-0000-0000-000000000000";
  const migrationSql: string[] = [];
  for (const name of names) {
    const root = new URL(`${name}/`, directory);
    expect((await readdir(root)).sort()).toEqual(["migration.sql", "snapshot.json"]);
    const migration = await readFile(new URL("migration.sql", root), "utf8");
    const snapshot = JSON.parse(await readFile(new URL("snapshot.json", root), "utf8"));
    expect(snapshot).toMatchObject({
      type: name === baseline ? "base" : "diff",
      dialect: "postgres",
      prevIds: [previousId],
    });
    previousId = snapshot.id;
    migrationSql.push(migration);
  }
  expect(migrationSql[0]).not.toMatch(/\bDROP\b|\bSET SCHEMA\b|raypx_foundation/i);
  const migration = migrationSql.join("\n");
  const tables = new Map(
    Array.from(migration.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g), (match) => [
      match[1],
      match[2]!,
    ]),
  );
  for (const [, table, column] of migration.matchAll(
    /ALTER TABLE "([^"]+)" ADD COLUMN "([^"]+)"/g,
  )) {
    expect(tables.has(table)).toBe(true);
    tables.set(table, `${tables.get(table)}\n"${column}" `);
  }
  const currentTables = Object.values(definitions).filter((value) => is(value, PgTable));
  expect(tables.size).toBe(currentTables.length);
  for (const table of currentTables) {
    const config = getTableConfig(table);
    expect(config.schema).toBeUndefined();
    const columns = tables.get(config.name);
    expect(columns).toBeDefined();
    for (const column of config.columns) {
      expect(columns).toContain(`"${column.name}" `);
    }
  }
});
