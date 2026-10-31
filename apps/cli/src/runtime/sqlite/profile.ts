import { Database } from "bun:sqlite";
import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { LocalError } from "../errors";
import { migrateLocalDatabase } from "./migrate";

/** Every store opens the same profile file; closing one store releases only its connection. */
export function openProfileDatabase(directory: string) {
  if (!isAbsolute(directory))
    throw new LocalError("INVALID_PROFILE", "Profile directory must be absolute");
  const path = join(directory, "profile.sqlite");
  if (
    !existsSync(path) &&
    [
      "state.sqlite",
      "agents.sqlite",
      "memory.sqlite",
      "terminal.sqlite",
      "terminal/terminal.sqlite",
      "pi-context.sqlite",
      "contexts.sqlite",
    ].some((name) => existsSync(resolve(directory, name)))
  )
    throw new LocalError(
      "UNSUPPORTED_SCHEMA",
      "This profile uses retired SQLite databases; create a new profile",
    );
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
