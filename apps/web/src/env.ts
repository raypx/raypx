import {
  analyticsEnv,
  authEnv,
  createEnv,
  databaseEnv,
  emailEnv,
  observabilityEnv,
  storageEnv,
  z,
} from "@raypx/config";

const env = createEnv({
  extends: [databaseEnv, authEnv, emailEnv, analyticsEnv, observabilityEnv, storageEnv],
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
