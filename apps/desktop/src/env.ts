import { createEnv, type Preset, z } from "@voidmix/shared/env";
import { runtimeEnv } from "@voidmix/shared/env/runtime";
import { loggerEnv } from "@voidmix/shared/logger/env";

export const desktopEnv = {
  id: "desktop",
  extends: [runtimeEnv, loggerEnv],
  client: {
    VITE_API_URL: z.url().optional(),
  },
} as const satisfies Preset;

export const env = createEnv(desktopEnv);
