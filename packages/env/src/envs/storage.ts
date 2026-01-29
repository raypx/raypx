import { z } from "zod/v4";

export const storageEnv = {
  id: "storage",
  server: {
    R2_ENDPOINT: z.url(),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
  },
  shared: {
    NEXT_PUBLIC_R2_PUBLIC_URL: z.url(),
  },
} as const;
