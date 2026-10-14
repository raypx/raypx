import { createEnv, type Preset, z } from "@voidmix/env";
import { runtimeEnv } from "@voidmix/env/runtime";

export const databaseEnv = {
  id: "database",
  server: {
    DATABASE_URL: z.url(),
  },
} as const satisfies Preset;

export function getDatabaseEnv() {
  return createEnv({ extends: [runtimeEnv, databaseEnv] });
}
