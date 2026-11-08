import type { Database } from "@raypx/database/connection";
import { createMailer } from "@raypx/email/server";
import { createUnavailableStorage } from "@raypx/storage";
import { createS3Storage } from "@raypx/storage/s3";
import { sql } from "drizzle-orm";
import { createCache } from "../cache/cache.ts";
import { createMemoryStore } from "../cache/memory.ts";
import { createTieredStore } from "../cache/tiered.ts";
import type { ApiEnvironment } from "../env.ts";
import { createRateLimiter } from "../rate-limit.ts";
import type { Cache } from "../cache/types.ts";
import type { ObjectStorage } from "@raypx/storage";
import type { RedisResources } from "./redis.ts";

/** Process-local copies in front of Redis; changes from other processes apply within it. */
const NEAR_CACHE_TTL_MS = 1_000;

export interface AdapterOverrides {
  cache?: Cache;
  storage?: ObjectStorage;
  redis?: RedisResources;
}

/**
 * Chooses each external adapter in one place: injected providers first, then Redis or
 * S3 when configured, then the PostgreSQL, memory or explicit-unavailable fallback.
 */
export function createAdapters(
  environment: ApiEnvironment,
  overrides: AdapterOverrides,
  db: Database,
) {
  const { redis } = overrides;
  return {
    mailer: createMailer({
      defaultLocale: environment.MAIL_DEFAULT_LOCALE,
      ...(environment.RESEND_API_KEY ? { apiKey: environment.RESEND_API_KEY } : {}),
      ...(environment.MAIL_FROM ? { from: environment.MAIL_FROM } : {}),
    }),
    cache:
      overrides.cache ??
      createCache(
        redis
          ? createTieredStore(createMemoryStore(), redis.cache, { nearTtlMs: NEAR_CACHE_TTL_MS })
          : createMemoryStore(),
      ),
    storage:
      overrides.storage ??
      (environment.s3 ? createS3Storage(environment.s3) : createUnavailableStorage()),
    ...(redis ? { secondaryStorage: redis.secondaryStorage } : {}),
    ...(environment.NODE_ENV === "production"
      ? { rateLimit: redis?.rateLimit ?? createRateLimiter(db) }
      : {}),
    readiness: {
      database: () => db.execute(sql`select 1`),
      ...(redis ? { redis: () => redis.ping() } : {}),
    },
  };
}

export function createAuthConfig(environment: ApiEnvironment) {
  return {
    baseURL: environment.AUTH_URL,
    secret: environment.AUTH_SECRET,
    trustedOrigins: environment.allowedOrigins,
    production: environment.NODE_ENV === "production",
    socialProviders: {
      ...(environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: environment.GOOGLE_CLIENT_ID,
              clientSecret: environment.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(environment.GITHUB_CLIENT_ID && environment.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: environment.GITHUB_CLIENT_ID,
              clientSecret: environment.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
    },
    ...(environment.AUTH_DOMAIN ? { cookieDomain: environment.AUTH_DOMAIN } : {}),
    ...(environment.ipAddressHeaders.length
      ? { ipAddressHeaders: environment.ipAddressHeaders }
      : {}),
    ...(environment.trustedProxies.length ? { trustedProxies: environment.trustedProxies } : {}),
  };
}
