import { SettingsReader } from "./reader.js";
import type { SystemSettingsRepository } from "@voidmix/core";
import { eq, inArray } from "drizzle-orm";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { systemSecrets, systemSettings } from "../schema.js";

export class PostgresSystemSettingsRepository
  extends SettingsReader
  implements SystemSettingsRepository
{
  constructor(private readonly db: PostgresJsDatabase) {
    super();
  }

  protected async readSettings(keys: readonly string[]) {
    return this.db
      .select()
      .from(systemSettings)
      .where(inArray(systemSettings.key, [...keys]));
  }

  protected async readSecret(key: string) {
    const [row] = await this.db
      .select()
      .from(systemSecrets)
      .where(eq(systemSecrets.key, key))
      .limit(1);
    return row ?? null;
  }
}
