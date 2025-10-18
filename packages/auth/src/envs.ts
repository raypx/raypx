import { envs as email } from "@raypx/email/envs";
import { createEnv, z } from "@raypx/shared";

export const envs = () =>
  createEnv({
    extends: [email()],
    server: {
      AUTH_GITHUB_ID: z.string().min(1),
      AUTH_GITHUB_SECRET: z.string().min(1),
      AUTH_SECRET: z.string().min(1),
      AUTH_DOMAIN: z.string().min(1).optional(),
    },
    runtimeEnv: {
      AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
      AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
      AUTH_SECRET: process.env.AUTH_SECRET,
      AUTH_DOMAIN: process.env.AUTH_DOMAIN,
    },
  });
