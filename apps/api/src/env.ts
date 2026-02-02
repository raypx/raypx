import { authEnv, createEnv, databaseEnv, redisEnv, z } from "@raypx/env";

const apiEnv = {
  id: "api",
  server: {
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
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
