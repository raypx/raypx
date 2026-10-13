import type { MailSettingsFallback } from "@raypx/core";
import {
  authSettingKeys,
  mailSettingKeys,
  mailSecretKey,
  resolveAuthSettings,
  resolveMailConfiguration,
  type SettingRow,
  type StoredConfigurationValue,
} from "./values.js";

/** Both adapters resolve persisted configuration for Auth and Mail. */
export abstract class SettingsReader {
  protected abstract readSettings(keys: readonly string[]): SettingRow[] | Promise<SettingRow[]>;
  protected abstract readSecret(
    key: string,
  ): StoredConfigurationValue | null | Promise<StoredConfigurationValue | null>;

  async resolveAuthSettings() {
    return resolveAuthSettings(await this.readSettings(authSettingKeys));
  }

  async resolveMailConfiguration(fallback: MailSettingsFallback) {
    const rows = await this.readSettings(mailSettingKeys);
    const secret = await this.readSecret(mailSecretKey);
    return resolveMailConfiguration(rows, secret, fallback);
  }
}
