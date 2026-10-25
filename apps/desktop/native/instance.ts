import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const desktopInstancePath = (directory: string) =>
  join(directory, "desktop-instance.sqlite");

/** SQLite holds an OS file lock for the lifetime of this connection. Never unlink
 * this file: replacing its inode would allow a second independent lock owner.
 * Process death releases the lock, regardless of PID reuse or stale metadata. */
export function acquireDesktopInstance(directory: string): (() => void) | null {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const database = new Database(desktopInstancePath(directory), { create: true, strict: true });
  try {
    database.exec(
      "PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS instance (id INTEGER PRIMARY KEY);",
    );
  } catch (error) {
    database.close();
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["SQLITE_BUSY", "SQLITE_LOCKED"].includes(String(error.code))
    )
      return null;
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      database.exec("ROLLBACK");
    } finally {
      database.close();
    }
  };
}
