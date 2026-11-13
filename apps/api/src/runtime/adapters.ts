import type { Database } from "@raypx/database/connection";
import { sql } from "drizzle-orm";
import type { ApiEnvironment } from "../env.js";
import { createMemoryRateLimiter, createRateLimiter } from "../rate-limit.js";
import type { RateLimiter } from "../rate-limit/types.js";
import type { RedisResources } from "./redis.js";

/**
 * Deployments share one store. Development counts in memory so the limited paths
 * are exercised locally. Tests stay unlimited unless they inject a limiter.
 */
function rateLimiting(
  environment: ApiEnvironment,
  db: Database,
  redis?: RedisResources,
): { rateLimit?: RateLimiter } {
  if (environment.NODE_ENV === "production")
    return { rateLimit: redis?.rateLimit ?? createRateLimiter(db) };
  return environment.NODE_ENV === "development" ? { rateLimit: createMemoryRateLimiter() } : {};
}

export function createAdapters(environment: ApiEnvironment, db: Database, redis?: RedisResources) {
  return {
    ...(redis ? { secondaryStorage: redis.secondaryStorage } : {}),
    ...rateLimiting(environment, db, redis),
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
    checkCompromisedPasswords: environment.AUTH_CHECK_COMPROMISED_PASSWORDS,
    ...(environment.AUTH_PASSKEY_RP_ID ? { passkeyRpId: environment.AUTH_PASSKEY_RP_ID } : {}),
    ...(environment.AUTH_TURNSTILE_SITE_KEY && environment.AUTH_TURNSTILE_SECRET_KEY
      ? {
          turnstile: {
            siteKey: environment.AUTH_TURNSTILE_SITE_KEY,
            secretKey: environment.AUTH_TURNSTILE_SECRET_KEY,
          },
        }
      : {}),
    ...(environment.AUTH_DOMAIN ? { cookieDomain: environment.AUTH_DOMAIN } : {}),
    ...(environment.ipAddressHeaders.length
      ? { ipAddressHeaders: environment.ipAddressHeaders }
      : {}),
    ...(environment.trustedProxies.length ? { trustedProxies: environment.trustedProxies } : {}),
  };
}
