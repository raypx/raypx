import { createEnv, z } from "@raypx/env";

export const i18nEnv = {
  id: "i18n",
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
  },
} as const;

export const envs = () => createEnv(i18nEnv);
