import { createEnv, type Preset, z } from "@voidmix/env";
import { runtimeEnv } from "@voidmix/env/runtime";
import { loggerEnv } from "@raypx/shared/logger/env";

export const desktopEnv = {
  id: "desktop",
  extends: [runtimeEnv, loggerEnv],
  client: {
    VITE_API_URL: z.url().optional(),
  },
} as const satisfies Preset;

export const env = createEnv(desktopEnv);
