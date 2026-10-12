import { createEnv, type Preset, z } from "@voidmix/shared/env";
import { runtimeEnv } from "@voidmix/shared/env/runtime";

export const cacheEnv = {
  id: "cache",
  extends: [runtimeEnv],
  server: {
    REDIS_URL: z.url().optional(),
    CACHE_PREFIX: z.string().trim().min(1).default("voidmix"),
    CACHE_REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    CACHE_REDIS_OPERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    CACHE_REDIS_MAX_RETRIES_PER_REQUEST: z.coerce.number().int().nonnegative().default(1),
  },
} as const satisfies Preset;

/** Build the server-only cache environment without reading `.env` files. */
export function getCacheEnv(
  runtimeEnvValues?: Record<string, string | boolean | number | undefined>,
) {
  return createEnv({
    extends: [cacheEnv],
    ...(runtimeEnvValues ? { runtimeEnv: runtimeEnvValues } : {}),
  });
}
