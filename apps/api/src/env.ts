import { authEnv, createEnv, databaseEnv, redisEnv, z } from "@raypx/env";

const apiEnv = {
  id: "api",
  server: {
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  env: {
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
  },
} as const;

export const env = createEnv({
  extends: [authEnv, databaseEnv, redisEnv, apiEnv],
  env: {
    ...process.env,
    ...authEnv.env,
    ...databaseEnv.env,
    ...redisEnv.env,
    ...apiEnv.env,
  },
});
