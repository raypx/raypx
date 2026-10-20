import { createEnv, type Preset, z } from "@raypx-kit/env";

export const databaseEnv = {
  id: "database",
  server: { DATABASE_URL: z.url() },
} as const satisfies Preset;
export function getDatabaseEnv() {
  return createEnv(databaseEnv);
}
