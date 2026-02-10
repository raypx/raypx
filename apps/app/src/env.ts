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
  },
  server: {
    PORT: z.coerce.number().optional().default(3000),
    CRON_SECRET: z.string().optional(), // Secret for authenticating cron job requests
  },
  skip: process.env.NODE_ENV !== "production" || !!process.env.CI,
});

export default env;
