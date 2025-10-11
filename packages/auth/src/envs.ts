import { envs as db } from "@raypx/db/envs";
import { envs as email } from "@raypx/email/envs";
import { envs as redis } from "@raypx/redis/envs";
import { createEnv, z } from "@raypx/shared";

export const envs = () =>
  createEnv({
    clientPrefix: "VITE_",
    extends: [redis(), email(), db()],
    client: {
      VITE_PUBLIC_AUTH_GOOGLE_ID: z.string().min(1).optional(),
    },
    shared: {
      VITE_PUBLIC_AUTH_URL: z.url().min(1),
      VITE_PUBLIC_AUTH_GITHUB_ENABLED: z.string().optional(),
      VITE_PUBLIC_AUTH_GOOGLE_ENABLED: z.string().optional().default("false"),
    },
    server: {
      AUTH_GITHUB_ID: z.string().min(1).optional(),
      AUTH_GITHUB_SECRET: z.string().min(1).optional(),
      AUTH_RESEND_KEY: z.string().min(1).startsWith("re_").optional(),
      AUTH_SECRET: z.string().min(1),
      AUTH_DOMAIN: z.string().min(1).optional(),
      AUTH_GOOGLE_ID: z.string().min(1).optional(),
      AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
    },
    runtimeEnv: {
      AUTH_GITHUB_ID: import.meta.env.AUTH_GITHUB_ID,
      AUTH_GITHUB_SECRET: import.meta.env.AUTH_GITHUB_SECRET,
      AUTH_RESEND_KEY: import.meta.env.AUTH_RESEND_KEY,
      AUTH_SECRET: import.meta.env.AUTH_SECRET,
      AUTH_DOMAIN: import.meta.env.AUTH_DOMAIN,
      VITE_PUBLIC_AUTH_URL: import.meta.env.VITE_PUBLIC_AUTH_URL,
      AUTH_GOOGLE_ID: import.meta.env.AUTH_GOOGLE_ID,
      AUTH_GOOGLE_SECRET: import.meta.env.AUTH_GOOGLE_SECRET,
      VITE_PUBLIC_AUTH_GITHUB_ENABLED: import.meta.env.VITE_PUBLIC_AUTH_GITHUB_ENABLED,
      VITE_PUBLIC_AUTH_GOOGLE_ENABLED: import.meta.env.VITE_PUBLIC_AUTH_GOOGLE_ENABLED,
      VITE_PUBLIC_AUTH_GOOGLE_ID: import.meta.env.VITE_PUBLIC_AUTH_GOOGLE_ID,
    },
  });
