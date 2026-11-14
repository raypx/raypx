import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { LocalError } from "../errors.js";
export function profilePath(options: { dataDir?: string; profile?: string } = {}) {
  const profile = options.profile ?? "default";
  if (!/^[a-zA-Z0-9_-]+$/.test(profile))
    throw new LocalError(
      "INVALID_PROFILE",
      "Profile must contain letters, numbers, underscores or dashes",
    );
  const base =
    options.dataDir ??
    (process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? homedir(), "Raypx")
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support", "Raypx")
        : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "raypx"));
  return resolve(base, "profiles", profile);
}
export function acquireLock(directory: string, name: string): (() => void) | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(name))
    throw new LocalError("INVALID_LOCK", "Invalid lock identifier");
  const db = new Database(join(directory, `${name}.lock.sqlite`), { create: true });
  try {
    db.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE;");
  } catch {
    db.close();
    return null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      db.exec("ROLLBACK;");
    } finally {
      db.close();
    }
  };
}
