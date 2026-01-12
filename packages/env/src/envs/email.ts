import { z } from "zod";

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
} as const;
