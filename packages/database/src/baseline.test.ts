import { readFile, readdir } from "node:fs/promises";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import * as definitions from "./schema.js";

const directory = new URL("../drizzle-foundation/", import.meta.url);

it("ships one generated public-schema baseline covering every current table and column", async () => {
  const entries = await readdir(directory, { withFileTypes: true });
  expect(entries).toHaveLength(1);
  const baseline = entries[0]!;
  expect(baseline.isDirectory()).toBe(true);
  expect(baseline.name).toMatch(/^\d{14}_baseline$/);
  const root = new URL(`${baseline.name}/`, directory);
  expect((await readdir(root)).sort()).toEqual(["migration.sql", "snapshot.json"]);
  const migration = await readFile(new URL("migration.sql", root), "utf8");
  const snapshot = JSON.parse(await readFile(new URL("snapshot.json", root), "utf8"));
  expect(snapshot).toMatchObject({
    type: "base",
    dialect: "postgres",
    prevIds: ["00000000-0000-0000-0000-000000000000"],
  });
  expect(migration).not.toMatch(/\bDROP\b|\bSET SCHEMA\b|raypx_foundation/i);
  const tables = new Map(
    Array.from(migration.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g), (match) => [
      match[1],
      match[2]!,
    ]),
  );
  const currentTables = Object.values(definitions).filter((value) => is(value, PgTable));
  expect(tables.size).toBe(currentTables.length);
  for (const table of currentTables) {
    const config = getTableConfig(table);
    expect(config.schema).toBeUndefined();
    const body = tables.get(config.name);
    expect(body).toBeDefined();
    for (const column of config.columns) {
      expect(body).toContain(`"${column.name}" `);
    }
  }
});
