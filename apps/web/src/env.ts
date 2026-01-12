import { authEnv, createEnv, emailEnv } from "@raypx/env";

export const env = createEnv({
  extends: [authEnv, emailEnv],
});
