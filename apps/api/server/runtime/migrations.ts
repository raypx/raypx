import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase } from "@raypx/database";
import type { ApiEnvironment } from "../env.js";

/** Stage Nitro's private bundled SQL for the official Drizzle filesystem migrator. */
export async function migrateApiDatabase(
  environment: Pick<ApiEnvironment, "DATABASE_URL" | "DATABASE_MIGRATE_ON_START">,
): Promise<void> {
  if (!environment.DATABASE_MIGRATE_ON_START) return;
  let directory: string | undefined;
  try {
    const { useKV: getStorage } = await import("nitro/kv");
    const assets = getStorage("assets:database-migrations");
    const keys = (await assets.getKeys()).filter((key) => key.endsWith(":migration.sql"));
    if (!keys.length) throw new Error("Missing database migrations");
    directory = await mkdtemp(join(tmpdir(), "raypx-api-migrations-"));
    for (const key of keys) {
      const match = /^(\d{14}_[\w-]+):migration\.sql$/.exec(key);
      const raw = await assets.getItemRaw<string | Uint8Array>(key);
      const contents =
        raw instanceof Uint8Array ? new TextDecoder("utf-8", { fatal: true }).decode(raw) : raw;
      if (!match || typeof contents !== "string" || !contents.trim())
        throw new Error("Invalid database migration asset");
      const folder = join(directory, match[1]!);
      await mkdir(folder);
      await writeFile(join(folder, "migration.sql"), contents);
    }
    await migrateDatabase(environment.DATABASE_URL, directory);
  } catch {
    // Driver errors can include connection details or SQL. Never expose them at startup.
    throw new Error("API database migration failed. Check database availability and migrations.");
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
