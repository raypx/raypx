import { SettingsReader } from "./reader.js";
import { type StoredConfigurationValue } from "./values.js";
import type { SystemSettingsRepository } from "@voidmix/core";
export class InMemorySystemSettingsRepository
  extends SettingsReader
  implements SystemSettingsRepository
{
  readonly settings = new Map<string, StoredConfigurationValue>();
  readonly secrets = new Map<string, StoredConfigurationValue>();

  constructor(
    options: {
      settings?: Readonly<Record<string, string>>;
      secrets?: Readonly<Record<string, string>>;
      updatedAt?: Date;
    } = {},
  ) {
    super();
    const updatedAt = options.updatedAt ?? new Date("2026-01-01T00:00:00.000Z");
    for (const [key, value] of Object.entries(options.settings ?? {})) {
      this.settings.set(key, { value, updatedAt: new Date(updatedAt), updatedBy: null });
    }
    for (const [key, value] of Object.entries(options.secrets ?? {})) {
      this.secrets.set(key, { value, updatedAt: new Date(updatedAt), updatedBy: null });
    }
  }

  protected readSettings(keys: readonly string[]) {
    return keys.flatMap((key) => {
      const row = this.settings.get(key);
      return row ? [{ key, ...row }] : [];
    });
  }

  protected readSecret(key: string) {
    return this.secrets.get(key) ?? null;
  }
}
