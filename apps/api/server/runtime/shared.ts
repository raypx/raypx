import { createConfigurationRepository } from "../configuration/repository.js";
import { createConfigurationService } from "../configuration/service.js";
import type { ConfigurationRepository } from "../configuration/types.js";
import type { Cache } from "../cache/types.js";
import type { ObjectStorage } from "@raypx/storage";
import { createControlRepository } from "../control/repository.js";
import { ControlService } from "../control/service.js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import type { Database, DatabaseConnection } from "@raypx/database/connection";
import { schema } from "@raypx/database/schema";
import { configurationDefaults } from "@raypx/contracts/api";
import type { ApiLogging } from "../logging.js";
import { createApiApp } from "../api.js";
import { createCleanupJob } from "../jobs/cleanup.js";
import type { RedisResources } from "./redis.js";
import type { ApiEnvironment } from "../env.js";
import { createAdapters, createAuthConfig } from "./adapters.js";
import { createLifecycle } from "./lifecycle.js";

export interface RuntimeProviders {
  /** Called once per runtime with its owned connection; defaults to PostgreSQL. */
  createConfigurationRepository?: (db: Database) => ConfigurationRepository;
  /**
   * Application cache that should outlive per-request runtimes. Defaults to Redis when
   * configured, otherwise to memory owned by this runtime.
   */
  cache?: Cache;
  /** Object storage; defaults to S3 when configured, otherwise STORAGE_NOT_CONFIGURED. */
  storage?: ObjectStorage;
}

export interface RuntimeResources extends RuntimeProviders {
  logger: ApiLogging;
  onRevoke?: (userId: string, deviceId: string) => Promise<void>;
  connect(): DatabaseConnection;
  closeLogger(): Promise<void>;
  /** Owned by the runtime: sessions, rate limits and cache values; PostgreSQL is used without it. */
  redis?: RedisResources;
}

export async function createRuntime(environment: ApiEnvironment, resources: RuntimeResources) {
  const { logger, redis } = resources;
  // Registered first so it closes last and still records shutdown failures.
  const lifecycle = createLifecycle();
  lifecycle.own(() => resources.closeLogger());
  if (redis) lifecycle.own(() => redis.close());
  try {
    const connection = resources.connect();
    lifecycle.own(() => connection.close());
    const { db } = connection;
    const { mailer, cache, storage, secondaryStorage, rateLimit, readiness } = createAdapters(
      environment,
      resources,
      db,
    );
    const configuration = createConfigurationService({
      repository: (resources.createConfigurationRepository ?? createConfigurationRepository)(db),
      adminEmails: environment.ADMIN_EMAILS,
      cache,
    });
    const control = new ControlService(createControlRepository(db));
    const auth = createAuth({
      revokeHostAuthorizations: (userId, sessionId) =>
        control.revokeHostAuthorizations(userId, sessionId),
      registrationAllowed: async () => (await configuration.read()).values.registrationEnabled,
      siteName: () =>
        configuration.readCached().then(
          (snapshot) => snapshot.values.siteName,
          () => configurationDefaults.siteName,
        ),
      database: drizzleAdapter(db, { provider: "pg", schema }),
      mailer,
      ...(secondaryStorage ? { secondaryStorage } : {}),
      config: createAuthConfig(environment),
    });
    // Resolve from the same auth adapter for HTTP and direct server callers.
    // Keep sessions request-owned even when Node reuses the runtime.
    const readSession = (headers: Headers) => readAuthSession(auth, headers);
    return {
      cache,
      storage,
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
        readiness,
        ...(rateLimit ? { rateLimit } : {}),
      }),
      close: () => lifecycle.close(),
    };
  } catch (error) {
    // Preserve the original startup failure without printing close or drain errors.
    await lifecycle.close().catch(() => {});
    throw error;
  }
}
export type ApiRuntime = Awaited<ReturnType<typeof createRuntime>>;
