import { createEnv } from "@raypx/shared"
import { envs as auth } from "@raypx/auth/envs"
import { envs as db } from "@raypx/db/envs"
import { envs as redis } from "@raypx/redis/envs"

export const env = createEnv({
  extends: [auth(), db(), redis()],
  runtimeEnv: {},
  server: {},
  client: {},
})
