import type { ApiRuntimeEnvironment } from "./env.js";
import { createApiError } from "./canonical-errors.js";

export function cloudConfiguration(environment: ApiRuntimeEnvironment) {
  if (
    environment.NODE_ENV === "production" &&
    environment.AUTH_SECRET === "voidmix-development-secret-change-me"
  )
    throw new Error("Production requires an explicitly configured AUTH_SECRET.");
  const flags = {
    search: environment.CLOUD_SEARCH_ENABLED ?? false,
    computer: environment.CLOUD_COMPUTER_ENABLED ?? false,
    delegation: environment.CLOUD_DELEGATION_ENABLED ?? true,
    export: environment.CLOUD_EXPORT_ENABLED ?? true,
  };
  if (
    environment.NODE_ENV === "production" &&
    (flags.search || flags.computer) &&
    (!environment.CLOUD_ACCOUNT_MODEL_CALL_LIMIT ||
      !environment.CLOUD_ACCOUNT_CONCURRENCY ||
      !environment.CLOUD_ACCOUNT_STORAGE_BYTES)
  )
    throw new Error(
      "Production cloud AI requires positive account call, concurrency and storage quotas.",
    );
  if (!!environment.S3_ACCESS_KEY_ID !== !!environment.S3_SECRET_ACCESS_KEY)
    throw new Error("S3 requires both credential fields or the default credential chain.");
  return {
    flags,
    limits: {
      accountCalls: environment.CLOUD_ACCOUNT_MODEL_CALL_LIMIT ?? 100,
      accountConcurrentRuns: environment.CLOUD_ACCOUNT_CONCURRENCY ?? 2,
      accountStorageBytes: environment.CLOUD_ACCOUNT_STORAGE_BYTES ?? 100 * 1024 * 1024,
    },
  };
}

export function createCloudAdmission(options: {
  production: boolean;
  flags: { search: boolean; computer: boolean };
  requestLimit: number;
  increment?: (key: string, ttl: number) => Promise<number>;
}) {
  return async (actorId: string, mode: "search" | "computer") => {
    if (!options.flags[mode])
      throw createApiError("SERVICE_UNAVAILABLE", "CLOUD_CAPABILITY_DISABLED");
    if (!options.increment) {
      if (options.production)
        throw createApiError("SERVICE_UNAVAILABLE", "CLOUD_RATE_LIMIT_UNAVAILABLE");
      return;
    }
    let count: number;
    try {
      count = await options.increment(`cloud-admission:${actorId}`, 60);
    } catch {
      throw createApiError("SERVICE_UNAVAILABLE", "CLOUD_RATE_LIMIT_UNAVAILABLE");
    }
    if (count > options.requestLimit)
      throw createApiError("TOO_MANY_REQUESTS", "CLOUD_RATE_LIMIT_EXCEEDED");
  };
}
