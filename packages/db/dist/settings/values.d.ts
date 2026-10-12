import { type AuthSettingsView, type MailSettings, type MailSettingsFallback } from "@voidmix/core";
export interface StoredConfigurationValue {
    value: string;
    updatedAt: Date;
    updatedBy: string | null;
}
export interface SettingRow extends StoredConfigurationValue {
    key: string;
}
export declare const mailSettingKeys: readonly ["mail.enabled", "mail.from", "mail.from_name", "mail.templates_base_url"];
export declare const mailSecretKey = "mail.resend_api_key";
export declare const authSettingKeys: readonly ["auth.registration_mode", "auth.allowed_email_domains", "mail.welcome_enabled", "mail.verification_enabled", "mail.password_reset_enabled"];
export declare function resolveMailSettings(settingRows: readonly SettingRow[], secretRow: StoredConfigurationValue | null, fallback: MailSettingsFallback): MailSettings;
export declare function resolveAuthSettings(settingRows: readonly SettingRow[]): AuthSettingsView;
export declare function operationKey(operation: string): string;
//# sourceMappingURL=values.d.ts.map