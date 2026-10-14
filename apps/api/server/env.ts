import { apiRuntimeEnv } from "./api/env.js";
import { createEnv, type Preset, z } from "@voidmix/env";

export const apiServerEnv = {
  id: "api-server",
  extends: [apiRuntimeEnv],
  server: {
    AUTH_URL: z.url().default("http://localhost:3002"),
  },
} as const satisfies Preset;

export const env = createEnv(apiServerEnv);
