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
import {
  CloudJobsService,
  type CloudJobExecutor,
  type CloudJobsRepository,
} from "@raypx/jobs/server";
import { JobError } from "@raypx/jobs";
import { createCloudJobsRepository } from "../jobs/repository.js";
import { createScheduleTick } from "../jobs/tick.js";
import { ContextLibraryService, type ContextLibraryRepository } from "@raypx/memory/server";
import { createContextRepository } from "../memory/repository.js";

export interface RuntimeProviders {
  /** Called once per runtime with its owned connection; defaults to PostgreSQL. */
  createConfigurationRepository?: (db: Database) => ConfigurationRepository;
  createJobsRepository?: (db: Database) => CloudJobsRepository;
  createContextRepository?: (db: Database) => ContextLibraryRepository;
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
  /** Header owned by the platform entry, independently of configurable auth forwarding headers. */
  clientIpHeader?: string;
  onRevoke?: (userId: string, deviceId: string) => Promise<void>;
  createJobExecutor?: (control: ControlService) => CloudJobExecutor;
  relayReadiness?: () => Promise<void>;
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
    const control = new ControlService(
      createControlRepository(db),
      Date.now,
      (owner, selection, target, prompt) => memory.resolve(owner, selection, target, prompt),
    );
    const memory = new ContextLibraryService({
      repository: (resources.createContextRepository ?? createContextRepository)(db),
      scope: "account",
      validateProject: (owner, target) => control.validateContextProject(owner, target),
    });
    const unavailable = async (): Promise<never> => {
      throw new JobError("CONTROL_UNAVAILABLE");
    };
    const cloudJobs = new CloudJobsService({
      repository: (resources.createJobsRepository ?? createCloudJobsRepository)(db),
      executor: resources.createJobExecutor?.(control) ?? {
        validate: unavailable,
        execute: unavailable,
        task: unavailable,
      },
      enabled: environment.JOBS_ENABLED,
    });
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
    // Keep sessions request-owned even when the process reuses the runtime.
    const readSession = (headers: Headers) => readAuthSession(auth, headers);
    return {
      cache,
      storage,
      control,
      configuration,
      cloudJobs,
      memory,
      readSession,
      jobs: {
        cleanup: createCleanupJob({ db, logger, configuration, enabled: environment.JOBS_ENABLED }),
        tick: createScheduleTick(cloudJobs, logger, environment.JOBS_ENABLED),
      },
      app: createApiApp({
        ...(resources.clientIpHeader ? { clientIpHeader: resources.clientIpHeader } : {}),
        configuration,
        jobsEnabled: environment.JOBS_ENABLED,
        control,
        cloudJobs,
        memory,
        ...(resources.onRevoke ? { onRevoke: resources.onRevoke } : {}),
        authHandler: (request) => auth.handler(request),
        readSession,
        allowedOrigins: environment.allowedOrigins,
        mailAvailable: mailer.available,
        logger,
        readiness: {
          ...readiness,
          ...(resources.relayReadiness ? { relay: resources.relayReadiness } : {}),
        },
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
