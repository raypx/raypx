import { createConfigurationRepository } from "../configuration/repository.js";
import { createConfigurationService } from "../configuration/service.js";
import type { ConfigurationCache, ConfigurationRepository } from "../configuration/types.js";
import { createControlRepository } from "../control/repository.js";
import { ControlService } from "../control/service.js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import type { Database, DatabaseConnection } from "@raypx/database/connection";
import { schema } from "@raypx/database/schema";
import { configurationDefaults } from "@raypx/contracts/api";
import { createMailer } from "@raypx/mail/server";
import type { ApiLogging } from "../logging.js";
import { sql } from "drizzle-orm";
import { createApiApp } from "../api.js";
import { createRateLimiter } from "../rate-limit.js";
import { createCleanupJob } from "../jobs/cleanup.js";
import type { RedisResources } from "./redis.js";
import type { ApiEnvironment } from "../env.js";

export interface RuntimeProviders {
  /** Called once per runtime with its owned connection; defaults to PostgreSQL. */
  createConfigurationRepository?: (db: Database) => ConfigurationRepository;
  /** Outlives per-request runtimes so public reads stay cached; defaults to per runtime. */
  configurationCache?: ConfigurationCache;
}

export interface RuntimeResources extends RuntimeProviders {
  logger: ApiLogging;
  onRevoke?: (userId: string, deviceId: string) => Promise<void>;
  connect(): DatabaseConnection;
  closeLogger(): Promise<void>;
  /** Shared cache for sessions and rate limits; PostgreSQL is used without it. */
  redis?: RedisResources;
}

export async function createRuntime(environment: ApiEnvironment, resources: RuntimeResources) {
  const { logger } = resources;
  let connection: DatabaseConnection | undefined;
  try {
    connection = resources.connect();
    const { db } = connection;
    const mailer = createMailer({
      defaultLocale: environment.MAIL_DEFAULT_LOCALE,
      ...(environment.RESEND_API_KEY ? { apiKey: environment.RESEND_API_KEY } : {}),
      ...(environment.MAIL_FROM ? { from: environment.MAIL_FROM } : {}),
    });
    const configuration = createConfigurationService({
      repository: (resources.createConfigurationRepository ?? createConfigurationRepository)(db),
      adminEmails: environment.ADMIN_EMAILS,
      ...(resources.configurationCache ? { cache: resources.configurationCache } : {}),
    });
    const auth = createAuth({
      registrationAllowed: async () => (await configuration.read()).values.registrationEnabled,
      siteName: () =>
        configuration.readCached().then(
          (snapshot) => snapshot.values.siteName,
          () => configurationDefaults.siteName,
        ),
      database: drizzleAdapter(connection.db, { provider: "pg", schema }),
      mailer,
      ...(resources.redis ? { secondaryStorage: resources.redis.secondaryStorage } : {}),
      config: {
        baseURL: environment.AUTH_URL,
        secret: environment.AUTH_SECRET,
        trustedOrigins: environment.allowedOrigins,
        production: environment.NODE_ENV === "production",
        ...(environment.AUTH_DOMAIN ? { cookieDomain: environment.AUTH_DOMAIN } : {}),
        ...(environment.ipAddressHeaders.length
          ? { ipAddressHeaders: environment.ipAddressHeaders }
          : {}),
        ...(environment.trustedProxies.length
          ? { trustedProxies: environment.trustedProxies }
          : {}),
      },
    });
    const control = new ControlService(createControlRepository(db));
    // Resolve from the same auth adapter for HTTP and direct server callers.
    // Keep sessions request-owned even when Node reuses the runtime.
    const readSession = (headers: Headers) => readAuthSession(auth, headers);
    return {
      control,
      configuration,
      readSession,
      jobs: {
        cleanup: createCleanupJob({ db, logger, configuration, enabled: environment.JOBS_ENABLED }),
      },
      app: createApiApp({
        configuration,
        jobsEnabled: environment.JOBS_ENABLED,
        control,
        ...(resources.onRevoke ? { onRevoke: resources.onRevoke } : {}),
        authHandler: (request) => auth.handler(request),
        readSession,
        allowedOrigins: environment.allowedOrigins,
        mailAvailable: mailer.available,
        logger,
        readiness: {
          database: () => db.execute(sql`select 1`),
          ...(resources.redis ? { redis: () => resources.redis!.ping() } : {}),
        },
        ...(environment.NODE_ENV === "production"
          ? { rateLimit: resources.redis?.rateLimit ?? createRateLimiter(connection.db) }
          : {}),
      }),
      close: async () => {
        try {
          await Promise.all([connection?.close(), resources.redis?.close()]);
        } finally {
          await resources.closeLogger();
        }
      },
    };
  } catch (error) {
    await connection?.close().catch(() => {
      /* Preserve the original startup failure. */
    });
    await resources.redis?.close().catch(() => {
      /* Preserve the original startup failure. */
    });
    await resources.closeLogger().catch(() => {
      /* Preserve the original startup failure without printing drain errors. */
    });
    throw error;
  }
}
export type ApiRuntime = Awaited<ReturnType<typeof createRuntime>>;
