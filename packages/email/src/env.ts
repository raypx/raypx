import { createEnv, emailEnv } from "@raypx/env";

export const env = createEnv({
  extends: [emailEnv],
});
