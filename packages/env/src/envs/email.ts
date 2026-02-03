import { z } from "zod/v4";

export const emailEnv = {
  id: "email",
  server: {
    RESEND_FROM: z.string().min(1),
    AUTH_RESEND_KEY: z.string().min(1).startsWith("re_", "Resend token must start with 're_'"),
    MAIL_HOST: z.string().min(1).optional(),
    MAIL_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    MAIL_SECURE: z.coerce.boolean().optional(),
    MAIL_USER: z.string().min(1).optional(),
    MAIL_PASSWORD: z.string().min(1).optional(),
  },
  env: {
    RESEND_FROM: process.env.RESEND_FROM,
    AUTH_RESEND_KEY: process.env.AUTH_RESEND_KEY,
    MAIL_HOST: process.env.MAIL_HOST,
    MAIL_PORT: process.env.MAIL_PORT,
    MAIL_SECURE: process.env.MAIL_SECURE,
    MAIL_USER: process.env.MAIL_USER,
    MAIL_PASSWORD: process.env.MAIL_PASSWORD,
  },
} as const;
