import { authEnv, createEnv, databaseEnv } from "@raypx/env";

export const env = createEnv({
  extends: [authEnv, databaseEnv],
});
