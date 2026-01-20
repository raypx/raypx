import {
  authEnv,
  billingEnv,
  createEnv,
  databaseEnv,
  emailEnv,
  observabilityEnv,
  redisEnv,
  z,
} from "@raypx/env";

export const env = createEnv({
  extends: [authEnv, databaseEnv, billingEnv, emailEnv, observabilityEnv, redisEnv],
  server: {
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
});
