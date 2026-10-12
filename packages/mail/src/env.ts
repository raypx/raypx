import { createEnv, type Preset, z } from "@voidmix/shared/env";
import { runtimeEnv } from "@voidmix/shared/env/runtime";
import { resolveConfiguredLocale } from "@voidmix/i18n/server";

export const mailEnv = {
  id: "mail",
  extends: [runtimeEnv],
  server: {
    RESEND_API_KEY: z.string().trim().min(1).optional(),
    MAIL_FROM: z.email().optional(),
    MAIL_FROM_NAME: z.string().trim().min(1).optional(),
    EMAIL_TEMPLATES_BASE_URL: z.url().optional(),
    MAIL_DEFAULT_LOCALE: z.string().optional(),
  },
} as const satisfies Preset;

export function getMailEnv(
  runtimeEnvValues?: Record<string, string | boolean | number | undefined>,
) {
  const env = createEnv({
    extends: [mailEnv],
    ...(runtimeEnvValues ? { runtimeEnv: runtimeEnvValues } : {}),
  });

  return {
    NODE_ENV: env.NODE_ENV,
    MAIL_FROM: env.MAIL_FROM ?? (env.NODE_ENV === "production" ? null : "noreply@voidmix.local"),
    MAIL_FROM_NAME: env.MAIL_FROM_NAME ?? "Voidmix",
    ...(env.RESEND_API_KEY ? { RESEND_API_KEY: env.RESEND_API_KEY } : {}),
    ...(env.EMAIL_TEMPLATES_BASE_URL
      ? { EMAIL_TEMPLATES_BASE_URL: env.EMAIL_TEMPLATES_BASE_URL }
      : {}),
    MAIL_DEFAULT_LOCALE: resolveConfiguredLocale(env.MAIL_DEFAULT_LOCALE),
  };
}

export type MailEnvironment = ReturnType<typeof getMailEnv>;
