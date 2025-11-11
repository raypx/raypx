import { authEnv } from "@raypx/auth/envs";
import { databaseEnv } from "@raypx/db/envs";
import { emailEnv } from "@raypx/email/envs";
import { createEnv, z } from "@raypx/env";

const env = createEnv({
  extends: [databaseEnv, authEnv, emailEnv],
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    MODE: z.string().optional(),
    VERCEL: z.coerce.boolean().optional().default(false),
  },
  server: {
    PORT: z.coerce.number().optional().default(3000),
    VERCEL_URL: z.string().optional(),
  },
  skip: process.env.NODE_ENV !== "production",
});

export default env;
