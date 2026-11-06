import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Readers pin a whole immutable distribution; cleanup must own an exclusive lock. */
export function runtimeLease(directory: string, exclusive = false): (() => void) | undefined {
  const parent = join(dirname(directory), ".leases");
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const database = new Database(join(parent, basename(directory) + ".sqlite"));
  try {
    database.exec(
      "PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY)",
    );
    database.exec(exclusive ? "BEGIN EXCLUSIVE" : "BEGIN; SELECT * FROM lease");
    return () => database.close();
  } catch (error) {
    database.close();
    if (error && typeof error === "object" && "code" in error && error.code === "SQLITE_BUSY")
      return undefined;
    throw error;
  }
}
