import { z } from "zod/v4";
import { emailEnv } from "./email";

export const authEnv = {
  id: "auth",
  extends: [emailEnv],
  shared: {
    NEXT_PUBLIC_AUTH_URL: z.url(),
  },
  server: {
    AUTH_GITHUB_ID: z.string().min(1),
    AUTH_GITHUB_SECRET: z.string().min(1),
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    AUTH_DOMAIN: z.string().min(1).optional(),
  },
  env: {
    ...emailEnv.env,
    NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_DOMAIN: process.env.AUTH_DOMAIN,
  },
} as const;
