import { envs as db } from "@raypx/db/envs";
import { createEnv } from "@t3-oss/env-core";

export const env = createEnv({
  extends: [db()],
  clientPrefix: "VITE_",
  client: {},
  runtimeEnv: import.meta.env,
});
