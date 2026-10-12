import { createEnv, type Preset, z } from "@raypx/shared/env";
import { runtimeEnv } from "@raypx/shared/env/runtime";
import { loggerEnv } from "@raypx/shared/logger/env";

export const desktopEnv = {
  id: "desktop",
  extends: [runtimeEnv, loggerEnv],
  client: {
    VITE_API_URL: z.url().optional(),
  },
} as const satisfies Preset;

export const env = createEnv(desktopEnv);
