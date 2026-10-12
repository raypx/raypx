import type { InheritedSetting } from "@raypx/shared";

export interface MailRuntimeSettings {
  enabled: boolean;
  from: string | null;
  fromName: string;
  templatesBaseUrl: string | null;
  configurationState: "ready" | "disabled" | "incomplete";
  missing: Array<"RESEND_API_KEY" | "MAIL_FROM">;
}
type MailFields = Pick<MailRuntimeSettings, "enabled" | "from" | "fromName" | "templatesBaseUrl">;
type InheritedSettings<T> = { [K in keyof T]: InheritedSetting<T[K]> };
export interface MailSettingsFallback extends InheritedSettings<MailFields> {
  resendApiKey: InheritedSetting<string | null>;
}
export interface MailRuntimeConfiguration {
  settings: MailRuntimeSettings;
  resendApiKey: string | null;
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
  resolveAuthSettings(): Promise<AuthSettings>;
  resolveMailConfiguration(fallback: MailSettingsFallback): Promise<MailRuntimeConfiguration>;
}
