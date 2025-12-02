import { z } from "@raypx/env";

export const storageEnv = {
  id: "storage",
  server: {
    R2_ENDPOINT: z.string().url(),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET_NAME: z.string().min(1),
  },
  shared: {
    VITE_R2_PUBLIC_URL: z.string().url(),
  },
} as const;
