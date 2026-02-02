import { authEnv, createEnv, databaseEnv } from "@raypx/env";

export const env = createEnv({
  extends: [authEnv, databaseEnv],
  env: {
    ...process.env,
    ...authEnv.env,
    ...databaseEnv.env,
  },
});
