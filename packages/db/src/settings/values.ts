import {
  createDefaultAuthSettings,
  type AuthSettingsView,
  type MailSettings,
  type MailSettingsFallback,
} from "@voidmix/core";
export interface StoredConfigurationValue {
  value: string;
  updatedAt: Date;
  updatedBy: string | null;
}
export interface SettingRow extends StoredConfigurationValue {
  key: string;
}
export const mailSettingKeys = [
  "mail.enabled",
  "mail.from",
  "mail.from_name",
  "mail.templates_base_url",
] as const;
export const mailSecretKey = "mail.resend_api_key";
export const authSettingKeys = [
  "auth.registration_mode",
  "auth.allowed_email_domains",
  "mail.welcome_enabled",
  "mail.verification_enabled",
  "mail.password_reset_enabled",
] as const;

export function resolveMailSettings(
  settingRows: readonly SettingRow[],
  secretRow: StoredConfigurationValue | null,
  fallback: MailSettingsFallback,
): MailSettings {
  const values = new Map(settingRows.map((row) => [row.key, row.value]));
  const enabled = parseBoolean(values.get("mail.enabled"), fallback.enabled.value);
  const from = resolveNullable(values.get("mail.from"), fallback.from.value);
  const fromName = values.get("mail.from_name") ?? fallback.fromName.value;
  const templatesBaseUrl = resolveNullable(
    values.get("mail.templates_base_url"),
    fallback.templatesBaseUrl.value,
  );
  const resendApiKey = secretRow?.value ?? fallback.resendApiKey.value;
  const updatedAt = latestDate([...settingRows.map((row) => row.updatedAt), secretRow?.updatedAt]);
  const missing: MailSettings["missing"] = [];
  if (enabled && !resendApiKey) missing.push("RESEND_API_KEY");
  if (enabled && !from) missing.push("MAIL_FROM");
  return {
    enabled,
    from,
    fromName,
    templatesBaseUrl,
    sources: {
      enabled: values.has("mail.enabled") ? "database" : fallback.enabled.source,
      from: values.has("mail.from") ? "database" : fallback.from.source,
      fromName: values.has("mail.from_name") ? "database" : fallback.fromName.source,
      templatesBaseUrl: values.has("mail.templates_base_url")
        ? "database"
        : fallback.templatesBaseUrl.source,
    },
    inherited: {
      enabled: { ...fallback.enabled },
      from: { ...fallback.from },
      fromName: { ...fallback.fromName },
      templatesBaseUrl: { ...fallback.templatesBaseUrl },
    },
    resendApiKey: {
      configured: Boolean(resendApiKey),
      source: secretRow ? "database" : fallback.resendApiKey.value ? "environment" : "missing",
      inheritedConfigured: Boolean(fallback.resendApiKey.value),
    },
    configurationState: !enabled ? "disabled" : missing.length === 0 ? "ready" : "incomplete",
    missing,
    updatedAt,
  };
}

export function resolveAuthSettings(settingRows: readonly SettingRow[]): AuthSettingsView {
  const defaults = createDefaultAuthSettings();
  const values = new Map(settingRows.map((row) => [row.key, row.value]));
  return {
    registrationMode: values.get("auth.registration_mode") === "closed" ? "closed" : "open",
    allowedEmailDomains: parseStringArray(
      values.get("auth.allowed_email_domains"),
      defaults.allowedEmailDomains,
    ),
    welcomeEmailEnabled: parseBoolean(
      values.get("mail.welcome_enabled"),
      defaults.welcomeEmailEnabled,
    ),
    verificationEmailEnabled: parseBoolean(
      values.get("mail.verification_enabled"),
      defaults.verificationEmailEnabled,
    ),
    passwordResetEmailEnabled: parseBoolean(
      values.get("mail.password_reset_enabled"),
      defaults.passwordResetEmailEnabled,
    ),
    sources: {
      registrationMode: values.has("auth.registration_mode") ? "database" : "default",
      allowedEmailDomains: values.has("auth.allowed_email_domains") ? "database" : "default",
      welcomeEmailEnabled: values.has("mail.welcome_enabled") ? "database" : "default",
      verificationEmailEnabled: values.has("mail.verification_enabled") ? "database" : "default",
      passwordResetEmailEnabled: values.has("mail.password_reset_enabled") ? "database" : "default",
    },
    inherited: {
      registrationMode: { value: defaults.registrationMode, source: "default" },
      allowedEmailDomains: { value: [...defaults.allowedEmailDomains], source: "default" },
      welcomeEmailEnabled: { value: defaults.welcomeEmailEnabled, source: "default" },
      verificationEmailEnabled: {
        value: defaults.verificationEmailEnabled,
        source: "default",
      },
      passwordResetEmailEnabled: {
        value: defaults.passwordResetEmailEnabled,
        source: "default",
      },
    },
    updatedAt: latestDate(settingRows.map((row) => row.updatedAt)),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true";
}

function resolveNullable(value: string | undefined, fallback: string | null): string | null {
  return value === undefined ? fallback : value || null;
}

function parseStringArray(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined) return [...fallback];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? [...new Set(parsed.map((item) => item.trim().toLowerCase()).filter(Boolean))]
      : [...fallback];
  } catch {
    return [...fallback];
  }
}

function latestDate(values: Array<Date | undefined>): Date | null {
  const timestamps = values.filter((value): value is Date => value !== undefined);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps.map((value) => value.getTime())));
}

export function operationKey(operation: string): string {
  return operation.slice(0, operation.lastIndexOf(":"));
}
