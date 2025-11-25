import { analyticsEnv } from "@raypx/analytics/envs";
import { authEnv } from "@raypx/auth/envs";
import { databaseEnv } from "@raypx/database/envs";
import { emailEnv } from "@raypx/email/envs";
import { createEnv, z } from "@raypx/env";
import { observabilityEnv } from "@raypx/observability/envs";

const env = createEnv({
  extends: [databaseEnv, authEnv, emailEnv, analyticsEnv, observabilityEnv],
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    MODE: z.string().optional(),
    VERCEL: z.coerce.boolean().optional().default(false),
  },
  server: {
    PORT: z.coerce.number().optional().default(3000),
    VERCEL_URL: z.string().optional(),
  },
  skip: process.env.NODE_ENV !== "production" || !!process.env.CI,
});

export default env;
