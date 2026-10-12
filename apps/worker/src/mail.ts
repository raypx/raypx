import { createEnv } from "@voidmix/shared/env";
import { createMailer, getMailEnv, mailEnv } from "@voidmix/mail/server";
import type { MailSettingsFallback, SystemSettingsRepository } from "@voidmix/core";

/** Re-resolve persisted settings for each delivery, including global disabling. */
export function createWorkerMailer(options: {
  settings: Pick<SystemSettingsRepository, "resolveMailConfiguration">;
  values?: Record<string, string | boolean | number | undefined>;
}) {
  const environment = createEnv({
    extends: [mailEnv],
    ...(options.values ? { runtimeEnv: options.values } : {}),
  });
  const fallback: MailSettingsFallback = {
    enabled: { value: true, source: "default" },
    from: environment.MAIL_FROM
      ? { value: environment.MAIL_FROM, source: "environment" }
      : { value: null, source: "missing" },
    fromName: environment.MAIL_FROM_NAME
      ? { value: environment.MAIL_FROM_NAME, source: "environment" }
      : { value: "Voidmix", source: "default" },
    templatesBaseUrl: environment.EMAIL_TEMPLATES_BASE_URL
      ? { value: environment.EMAIL_TEMPLATES_BASE_URL, source: "environment" }
      : { value: null, source: "missing" },
    resendApiKey: environment.RESEND_API_KEY
      ? { value: environment.RESEND_API_KEY, source: "environment" }
      : { value: null, source: "missing" },
  };
  return createMailer({
    env: getMailEnv({ ...environment }),
    resolveConfiguration: async () => {
      const configuration = await options.settings.resolveMailConfiguration(fallback);
      return {
        enabled: configuration.settings.enabled,
        from: configuration.settings.from,
        fromName: configuration.settings.fromName,
        templatesBaseUrl: configuration.settings.templatesBaseUrl,
        resendApiKey: configuration.resendApiKey,
      };
    },
  });
}
