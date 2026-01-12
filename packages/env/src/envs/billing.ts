import { z } from "zod";

export const billingEnv = {
  id: "billing",
  server: {
    STRIPE_SECRET_KEY: z.string().min(1).startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).startsWith("whsec_"),
  },
  shared: {
    VITE_STRIPE_PUBLISHABLE_KEY: z.string().min(1).startsWith("pk_"),
  },
} as const;
