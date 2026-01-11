import { analyticsEnv, createEnv, observabilityEnv } from "@raypx/env";

export const env = createEnv({
  extends: [observabilityEnv, analyticsEnv],
});
