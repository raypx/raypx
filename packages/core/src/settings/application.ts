import type {
  AuthSettings,
  MailSettingsFallback,
  PublicAuthCapabilities,
  SystemSettingsRepository,
} from "./model.js";

export function createPublicAuthCapabilities(options: {
  settings: Pick<SystemSettingsRepository, "resolveAuthSettings" | "resolveMailConfiguration">;
  mailFallback: MailSettingsFallback;
  resolveAuthSettings?: () => Promise<AuthSettings>;
}) {
  return {
    async get(): Promise<PublicAuthCapabilities> {
      const [auth, mail] = await Promise.all([
        options.resolveAuthSettings?.() ?? options.settings.resolveAuthSettings(),
        options.settings.resolveMailConfiguration(options.mailFallback),
      ]);
      const mailReady = mail.settings.configurationState === "ready";
      return {
        registrationAvailable:
          auth.registrationMode === "open" && auth.verificationEmailEnabled && mailReady,
        verificationEmailRequestAvailable: auth.verificationEmailEnabled && mailReady,
        passwordResetRequestAvailable: auth.passwordResetEmailEnabled && mailReady,
      };
    },
  };
}
