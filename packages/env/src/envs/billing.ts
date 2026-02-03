import { z } from "zod/v4";

export const billingEnv = {
  id: "billing",
  server: {
    STRIPE_SECRET_KEY: z.string().min(1).startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).startsWith("whsec_"),
  },
  shared: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).startsWith("pk_"),
  },
  env: {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
} as const;
