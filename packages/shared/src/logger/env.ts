import { createEnv, type Preset, z } from "@voidmix/env";
import { runtimeEnv } from "@voidmix/env/runtime";

const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const loggerEnv = {
  id: "logger",
  client: {
    VITE_LOG_LEVEL: logLevelSchema.optional(),
    VITE_LOG_PRETTY: z.stringbool().optional(),
  },
  server: {
    LOG_LEVEL: logLevelSchema.optional(),
    LOG_PRETTY: z.stringbool().optional(),
  },
} as const satisfies Preset;

export function getLoggerEnv(
  runtimeValues?: Record<string, string | boolean | number | undefined>,
) {
  return createEnv({
    extends: [runtimeEnv, loggerEnv],
    ...(runtimeValues ? { runtimeEnv: runtimeValues } : {}),
  });
}
