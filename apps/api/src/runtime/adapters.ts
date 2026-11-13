import type { Database } from "@raypx/database/connection";
import { sql } from "drizzle-orm";
import type { ApiEnvironment } from "../env.js";
import { createRateLimiter } from "../rate-limit.js";
import type { RedisResources } from "./redis.js";

export function createAdapters(environment: ApiEnvironment, db: Database, redis?: RedisResources) {
  return {
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
