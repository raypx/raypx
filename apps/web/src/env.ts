import { authEnv, createEnv, emailEnv, redisEnv } from "@raypx/env";

export const env = createEnv({
  extends: [authEnv, emailEnv, redisEnv],
  env: {
    ...process.env,
    ...authEnv.env,
    ...emailEnv.env,
    ...redisEnv.env,
  },
});
