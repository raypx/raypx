import { createEnv, type Preset, z } from "@voidmix/shared/env";
import { runtimeEnv } from "@voidmix/shared/env/runtime";

export const databaseEnv = {
  id: "database",
  server: {
    DATABASE_URL: z.url(),
  },
} as const satisfies Preset;

export function getDatabaseEnv() {
  return createEnv({ extends: [runtimeEnv, databaseEnv] });
}
