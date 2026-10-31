import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";

const directory = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
if (process.argv.slice(2).some((arg) => arg !== "--check"))
  throw new Error("Usage: bun scripts/generate-sqlite.ts [--check]");
if (!check) {
  const result = Bun.spawnSync(
    [process.execPath, "--bun", "drizzle-kit", "generate", "--config", "drizzle.config.ts"],
    { cwd: directory, stdout: "inherit", stderr: "inherit" },
  );
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
const folder = resolve(directory, "drizzle");
const journal = readMigrationFiles({ migrationsFolder: folder }).map((migration) => ({
  name: migration.name,
  timestamp: migration.folderMillis,
  sql: readFileSync(resolve(folder, migration.name, "migration.sql"), "utf8"),
}));
if (!journal.length) throw new Error("No profile migrations");
const file = resolve(directory, "src/runtime/sqlite/migrations.generated.json");
const source = JSON.stringify(journal, null, 2) + "\n";
if (check) {
  if (readFileSync(file, "utf8") !== source)
    throw new Error("Embedded SQLite migrations are stale; run bun run db:generate");
} else {
  writeFileSync(file, source);
}
