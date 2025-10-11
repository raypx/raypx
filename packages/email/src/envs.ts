import { createEnv, z } from "@raypx/shared";

export const envs = () =>
  createEnv({
    clientPrefix: "VITE_",
    client: {},
    server: {
      RESEND_FROM: z.string().min(1),
      RESEND_TOKEN: z.string().min(1).startsWith("re_", "Resend token must start with 're_'"),
      RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
      MAIL_HOST: z.string().min(1).optional(),
      MAIL_PORT: z.number().int().min(1).max(65_535).optional(),
      MAIL_SECURE: z.boolean().optional(),
      MAIL_USER: z.string().min(1).optional(),
      MAIL_PASSWORD: z.string().min(1).optional(),
      EMAIL_TRACKING_ENABLED: z.boolean().optional(),
    },
    runtimeEnv: {
      RESEND_FROM: import.meta.env.RESEND_FROM,
      RESEND_TOKEN: import.meta.env.RESEND_TOKEN || import.meta.env.AUTH_RESEND_KEY,
      RESEND_WEBHOOK_SECRET: import.meta.env.RESEND_WEBHOOK_SECRET,
      MAIL_HOST: import.meta.env.MAIL_HOST,
      MAIL_PORT: import.meta.env.MAIL_PORT
        ? Number.parseInt(import.meta.env.MAIL_PORT, 10)
        : undefined,
      MAIL_SECURE: import.meta.env.MAIL_SECURE === "true",
      MAIL_USER: import.meta.env.MAIL_USER,
      MAIL_PASSWORD: import.meta.env.MAIL_PASSWORD,
      EMAIL_TRACKING_ENABLED: import.meta.env.EMAIL_TRACKING_ENABLED === "true",
    },
  });
