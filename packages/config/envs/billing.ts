import { z } from "@raypx/env";

export const billingEnv = {
  id: "billing",
  server: {
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  },
} as const;
