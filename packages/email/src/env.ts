import { createEnv, emailEnv } from "@raypx/env";

export const env = createEnv({
  extends: [emailEnv],
  env: {
    ...process.env,
    ...emailEnv.env,
  },
});
