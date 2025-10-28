import { envs as auth } from "@raypx/auth/envs";
import { envs as db } from "@raypx/db/envs";
import { envs as email } from "@raypx/email/envs";
import { createEnv, z } from "@raypx/env";

const dbEnv = db();
const authEnv = auth();
const emailEnv = email();

const env = createEnv({
  extends: [dbEnv, authEnv, emailEnv],
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    MODE: z.string().optional(),
    VERCEL: z.coerce.boolean().optional().default(false),
  },
  server: {
    VERCEL_URL: z.string().optional(),
  },
  skipValidation: process.env.NODE_ENV !== "production",
});

export default env;
