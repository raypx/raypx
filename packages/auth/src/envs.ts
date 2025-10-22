import { envs as email } from "@raypx/email/envs";
import { createEnv, z } from "@raypx/env";

export const envs = () =>
  createEnv({
    extends: [email()],
    server: {
      AUTH_GITHUB_ID: z.string().min(1),
      AUTH_GITHUB_SECRET: z.string().min(1),
      AUTH_SECRET: z.string().min(1),
      AUTH_DOMAIN: z.string().min(1).optional(),
    },
  });
