import type { MailSettingsFallback, SystemSettingsRepository } from "@raypx/core";
import {
  authSettingKeys,
  mailSettingKeys,
  mailSecretKey,
  resolveAuthSettings,
  resolveMailConfiguration,
  type StoredConfigurationValue,
} from "./values.js";

export class InMemorySystemSettingsRepository implements SystemSettingsRepository {
  readonly settings = new Map<string, StoredConfigurationValue>();
  readonly secrets = new Map<string, StoredConfigurationValue>();

  constructor(
    options: {
      settings?: Readonly<Record<string, string>>;
      secrets?: Readonly<Record<string, string>>;
      updatedAt?: Date;
    } = {},
  ) {
    const updatedAt = options.updatedAt ?? new Date("2026-01-01T00:00:00.000Z");
    for (const [key, value] of Object.entries(options.settings ?? {})) {
      this.settings.set(key, { value, updatedAt: new Date(updatedAt), updatedBy: null });
    }
    for (const [key, value] of Object.entries(options.secrets ?? {})) {
      this.secrets.set(key, { value, updatedAt: new Date(updatedAt), updatedBy: null });
    }
  }

  async resolveAuthSettings() {
    return resolveAuthSettings(this.readSettings(authSettingKeys));
  }

  async resolveMailConfiguration(fallback: MailSettingsFallback) {
    return resolveMailConfiguration(
      this.readSettings(mailSettingKeys),
      this.secrets.get(mailSecretKey) ?? null,
      fallback,
    );
  }

  private readSettings(keys: readonly string[]) {
    return keys.flatMap((key) => {
      const row = this.settings.get(key);
      return row ? [{ key, ...row }] : [];
    });
  }
}
