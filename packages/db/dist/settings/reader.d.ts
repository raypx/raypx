import type { MailSettingsFallback, MailRuntimeConfiguration } from "@voidmix/core";
import { type SettingRow, type StoredConfigurationValue } from "./values.js";
/** Both adapters expose the same resolved views and secret-free public settings. */
export declare abstract class SettingsReader {
    protected abstract readSettings(keys: readonly string[]): SettingRow[] | Promise<SettingRow[]>;
    protected abstract readSecret(key: string): StoredConfigurationValue | null | Promise<StoredConfigurationValue | null>;
    getAuthSettings(): Promise<AuthSettingsView>;
    resolveAuthSettings(): Promise<AuthSettingsView>;
    private mail;
    getMailSettings(fallback: MailSettingsFallback): Promise<MailSettings>;
    resolveMailConfiguration(fallback: MailSettingsFallback): Promise<MailRuntimeConfiguration>;
}
//# sourceMappingURL=reader.d.ts.map