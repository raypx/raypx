import {
  authEnv,
  createEnv,
  databaseEnv,
  redisEnv,
  z,
} from "@raypx/env";

export const env = createEnv({
  extends: [authEnv, databaseEnv, redisEnv],
  server: {
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
});
