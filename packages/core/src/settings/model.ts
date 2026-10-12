import type { AuditEvent } from "../identity/model.js";
import type { InheritedSetting, SettingSource, UpdateSecret, UpdateSetting } from "@voidmix/shared";

export interface MailRuntimeSettings {
  enabled: boolean;
  from: string | null;
  fromName: string;
  templatesBaseUrl: string | null;
  configurationState: "ready" | "disabled" | "incomplete";
  missing: Array<"RESEND_API_KEY" | "MAIL_FROM">;
}
export interface MailSettings extends MailRuntimeSettings {
  sources: SettingSources<MailFields>;
  inherited: InheritedSettings<MailFields>;
  resendApiKey: {
    configured: boolean;
    source: Extract<SettingSource, "database" | "environment" | "missing">;
    inheritedConfigured: boolean;
  };
  updatedAt: Date | null;
}
type MailFields = Pick<MailRuntimeSettings, "enabled" | "from" | "fromName" | "templatesBaseUrl">;
type SettingSources<T> = { [K in keyof T]: SettingSource };
type InheritedSettings<T> = { [K in keyof T]: InheritedSetting<T[K]> };
type SettingUpdates<T> = { [K in keyof T]?: UpdateSetting<T[K]> };
export interface MailSettingsFallback extends InheritedSettings<MailFields> {
  resendApiKey: InheritedSetting<string | null>;
}
export interface MailRuntimeConfiguration {
  settings: MailRuntimeSettings;
  resendApiKey: string | null;
}
export interface UpdateMailSettingsInput {
  enabled?: UpdateSetting<boolean>;
  from?: UpdateSetting<string>;
  fromName?: UpdateSetting<string>;
  templatesBaseUrl?: UpdateSetting<string>;
  resendApiKey?: UpdateSecret;
}
export const registrationModes = ["open", "closed"] as const;
export type RegistrationMode = (typeof registrationModes)[number];
export interface AuthSettings {
  registrationMode: RegistrationMode;
  allowedEmailDomains: string[];
  welcomeEmailEnabled: boolean;
  verificationEmailEnabled: boolean;
  passwordResetEmailEnabled: boolean;
  updatedAt: Date | null;
}
type AuthFields = Omit<AuthSettings, "updatedAt">;
export interface AuthSettingsView extends AuthSettings {
  sources: SettingSources<AuthFields>;
  inherited: InheritedSettings<AuthFields>;
}
export type UpdateAuthSettingsInput = SettingUpdates<AuthFields>;
export interface PublicAuthCapabilities {
  registrationAvailable: boolean;
  verificationEmailRequestAvailable: boolean;
  passwordResetRequestAvailable: boolean;
}
export function createDefaultAuthSettings(): AuthSettings {
  return {
    registrationMode: "open",
    allowedEmailDomains: [],
    welcomeEmailEnabled: true,
    verificationEmailEnabled: true,
    passwordResetEmailEnabled: true,
    updatedAt: null,
  };
}
export interface SystemSettingsRepository {
  getAuthSettings(): Promise<AuthSettingsView>;
  resolveAuthSettings(): Promise<AuthSettings>;
  updateAuthSettings(input: {
    actorId: string;
    settings: UpdateAuthSettingsInput;
    audit: AuditEvent;
  }): Promise<AuthSettingsView>;
  getMailSettings(fallback: MailSettingsFallback): Promise<MailSettings>;
  resolveMailConfiguration(fallback: MailSettingsFallback): Promise<MailRuntimeConfiguration>;
  updateMailSettings(input: {
    actorId: string;
    settings: UpdateMailSettingsInput;
    fallback: MailSettingsFallback;
    audit: AuditEvent;
  }): Promise<MailSettings>;
}
