import { createEnv, z } from "@raypx/env";

export const env = createEnv({
  extends: [],
  shared: {
    BASE_URL: z.string().optional(),
  },
});

export type Env = typeof env;
