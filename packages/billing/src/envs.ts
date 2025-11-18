import { createEnv, z } from "@raypx/env";

const billingEnv = {
  id: "billing",
  server: {
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  },
} as const;

export const envs = () => createEnv(billingEnv);
