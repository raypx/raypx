import type { MailSettingsFallback, MailRuntimeConfiguration } from "@voidmix/core";
import {
  authSettingKeys,
  mailSettingKeys,
  mailSecretKey,
  resolveAuthSettings,
  resolveMailSettings,
  type SettingRow,
  type StoredConfigurationValue,
} from "./values.js";

/** Both adapters expose the same resolved views and secret-free public settings. */
export abstract class SettingsReader {
  protected abstract readSettings(keys: readonly string[]): SettingRow[] | Promise<SettingRow[]>;
  protected abstract readSecret(
    key: string,
  ): StoredConfigurationValue | null | Promise<StoredConfigurationValue | null>;

  async getAuthSettings() {
    return resolveAuthSettings(await this.readSettings(authSettingKeys));
  }

  async resolveAuthSettings() {
    const { sources: _sources, inherited: _inherited, ...settings } = await this.getAuthSettings();
    return settings;
  }

  private async mail(fallback: MailSettingsFallback) {
    const rows = await this.readSettings(mailSettingKeys);
    const secret = await this.readSecret(mailSecretKey);
    return { view: resolveMailSettings(rows, secret, fallback), secret };
  }

  async getMailSettings(fallback: MailSettingsFallback) {
    return (await this.mail(fallback)).view;
  }

  async resolveMailConfiguration(
    fallback: MailSettingsFallback,
  ): Promise<MailRuntimeConfiguration> {
    const { view, secret } = await this.mail(fallback);
    const {
      sources: _sources,
      inherited: _inherited,
      resendApiKey: _key,
      updatedAt: _date,
      ...settings
    } = view;
    return { settings, resendApiKey: secret?.value ?? fallback.resendApiKey.value };
  }
}
