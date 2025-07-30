import { createEnv } from "@raypx/shared"

export const envs = () =>
  createEnv({
    client: {},
    shared: {},
    server: {},
    runtimeEnv: {},
  })
