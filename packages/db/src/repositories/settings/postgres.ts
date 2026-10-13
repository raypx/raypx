import type { MailSettingsFallback, SystemSettingsRepository } from "@raypx/core";
import { eq, inArray } from "drizzle-orm";
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { systemSecrets, systemSettings } from "../../schema.js";
import {
  authSettingKeys,
  mailSettingKeys,
  mailSecretKey,
  resolveAuthSettings,
  resolveMailConfiguration,
} from "./values.js";

export class PostgresSystemSettingsRepository implements SystemSettingsRepository {
  constructor(private readonly db: PostgresJsDatabase) {}

  async resolveAuthSettings() {
    return resolveAuthSettings(await this.readSettings(authSettingKeys));
  }

  async resolveMailConfiguration(fallback: MailSettingsFallback) {
    const settings = await this.readSettings(mailSettingKeys);
    const [row] = await this.db
      .select()
      .from(systemSecrets)
      .where(eq(systemSecrets.key, mailSecretKey))
      .limit(1);
    return resolveMailConfiguration(settings, row ?? null, fallback);
  }

  private async readSettings(keys: readonly string[]) {
    return this.db
      .select()
      .from(systemSettings)
      .where(inArray(systemSettings.key, [...keys]));
  }
}
