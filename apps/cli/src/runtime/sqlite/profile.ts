import { Database } from "bun:sqlite";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrateLocalDatabase } from "./migrate.js";
import { protectProfile } from "./permissions.js";

/** Only the profile owner opens and migrates the shared writer. */
function openProfileDatabase(directory: string) {
  protectProfile(directory);
  const path = join(directory, "desktop-session.sqlite");
  const client = new Database(path, { create: true, strict: true });
  try {
    if (process.platform !== "win32") protectProfile(directory);
    const database = drizzle({ client });
    migrateLocalDatabase(database);
    // On Windows the protected directory ACL already applies to newly created sidecars.
    // Existing files were secured before opening SQLite.
    if (process.platform !== "win32") protectProfile(directory);
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
