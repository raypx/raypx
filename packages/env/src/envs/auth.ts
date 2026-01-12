import { z } from "zod";
import { emailEnv } from "./email.ts";

export const authEnv = {
  id: "auth",
  extends: [emailEnv],
  shared: {
    VITE_AUTH_URL: z.url().optional(),
  },
  server: {
    AUTH_GITHUB_ID: z.string().min(1),
    AUTH_GITHUB_SECRET: z.string().min(1),
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    AUTH_DOMAIN: z.string().min(1).optional(),
  },
} as const;
