import { databaseEnv } from "@voidmix/db/env";
import { createEnv, type Preset, z } from "@voidmix/shared/env";
import { runtimeEnv } from "@voidmix/shared/env/runtime";
import { loggerEnv } from "@voidmix/shared/logger/env";

const scriptsEnv = {
  id: "scripts-runtime",
  extends: [runtimeEnv, loggerEnv],
  server: {
    CI: z.union([z.boolean(), z.stringbool()]).default(false),
  },
} as const satisfies Preset;

const databaseScriptsEnv = {
  id: "scripts-database",
  extends: [scriptsEnv, databaseEnv],
  server: {
    SEED_ADMIN_EMAIL: z.email().default("owner@voidmix.local"),
    SEED_ADMIN_NAME: z.string().trim().min(1).default("Local Owner"),
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_DISPLAY_NAME: z.string().trim().min(1).optional(),
  },
} as const satisfies Preset;

export function getScriptsEnv(runtimeEnv: NodeJS.ProcessEnv | Record<string, string>) {
  return createEnv({ ...scriptsEnv, runtimeEnv });
}

export function getDatabaseScriptsEnv(runtimeEnv: NodeJS.ProcessEnv | Record<string, string>) {
  return createEnv({ ...databaseScriptsEnv, runtimeEnv });
}

export type ScriptsEnvironment = ReturnType<typeof getScriptsEnv>;
export type DatabaseScriptsEnvironment = ReturnType<typeof getDatabaseScriptsEnv>;
