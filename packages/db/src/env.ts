import { createEnv, type Preset, z } from "@voidmix/env";

export const databaseEnv = {
  id: "database",
  server: { DATABASE_URL: z.url() },
} as const satisfies Preset;
export function getDatabaseEnv() {
  return createEnv(databaseEnv);
}
