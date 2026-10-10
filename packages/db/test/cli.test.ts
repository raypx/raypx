import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";
import { createDatabase } from "../src/index.js";
import { user } from "../src/schema.js";

const directories: string[] = [];
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("migration CLI works from an unrelated cwd and applies the package assets", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-cli-"));
  directories.push(directory);
  const path = join(directory, "database.db");
  const result = spawnSync("bun", [cli], {
    cwd: directory,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE_PATH: path,
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Database migrations applied");
  const connection = createDatabase(path);
  try {
    expect(connection.db.select().from(user).all()).toEqual([]);
  } finally {
    connection.close();
  }
});

test("migration CLI failure does not expose the database path or driver error details", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-cli-"));
  directories.push(directory);
  const path = join(directory, "sensitive-database-directory");
  mkdirSync(path);
  const result = spawnSync("bun", [cli], {
    cwd: directory,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE_PATH: path,
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
  });
  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe(
    "Database migration failed. Check database configuration and migration assets.",
  );
  expect(result.stdout + result.stderr).not.toContain(path);
  expect(result.stdout + result.stderr).not.toContain("SQLITE_CANTOPEN");
});
