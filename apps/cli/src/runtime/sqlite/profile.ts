import { Database } from "bun:sqlite";
import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { LocalError } from "../errors";
import { migrateLocalDatabase } from "./migrate";

/** Only the profile owner opens and migrates the shared writer. */
function openProfileDatabase(directory: string) {
  if (!isAbsolute(directory))
    throw new LocalError("INVALID_PROFILE", "Profile directory must be absolute");
  const path = join(directory, "profile.sqlite");
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new LocalError("UNSUPPORTED_SCHEMA", "Profile database must be a regular file");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const client = new Database(path, { create: true, strict: true });
  try {
    if (process.platform !== "win32") chmodSync(path, 0o600);
    const database = drizzle({ client });
    migrateLocalDatabase(database);
    return database;
  } catch (error) {
    client.close();
    throw error;
  }
}

export class ProfileStorage {
  readonly database: ReturnType<typeof drizzle>;
  private closed = false;
  constructor(readonly directory: string) {
    this.database = openProfileDatabase(directory);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.database.$client.close();
  }
}
