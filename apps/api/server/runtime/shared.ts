import { InstanceService } from "@raypx/instances/server";
import { createInstanceSigner, instanceDigest, verifyProof } from "@raypx/instances/crypto";
import { createInstanceRepository } from "../instances/repository.ts";
import { createConfigurationRepository } from "../configuration/repository.ts";
import { createAccessPolicy } from "../access.ts";
import { createConfigurationService } from "../configuration/service.ts";
import type { ConfigurationRepository } from "../configuration/types.ts";
import type { Cache } from "../cache/types.ts";
import type { ObjectStorage } from "@raypx/storage";
import { createControlRepository, createContextRepository } from "@raypx/control/postgres";
import { ControlService, ControlProjects } from "@raypx/control";
import { createAuditedAuthAdapter } from "../administration/auth-adapter.ts";
import {
  createAdministrationRepository,
  type AdministrationRepository,
} from "../administration/repository.ts";
import { AuditService } from "../administration/audit.ts";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import type { Database, DatabaseConnection } from "@raypx/database/connection";
import { configurationDefaults } from "@raypx/contracts/api";
import type { ApiLogging } from "../logging.ts";
import { createApiApp } from "../api.ts";
import { createCleanupJob } from "../jobs/cleanup.ts";
import type { RedisResources } from "./redis.ts";
import type { ApiEnvironment } from "../env.ts";
import { createAdapters, createAuthConfig } from "./adapters.ts";
import { createLifecycle } from "./lifecycle.ts";
import {
  CloudJobsService,
  type CloudJobExecutor,
  type CloudJobsRepository,
} from "@raypx/jobs/server";
import { JobError } from "@raypx/jobs";
import { createCloudJobsRepository } from "../jobs/repository.ts";
import { createScheduleTick } from "../jobs/tick.ts";
import { ContextLibraryService, type ContextLibraryRepository } from "@raypx/memory/server";

export interface RuntimeProviders {
  /** Called once per runtime with its owned connection; defaults to PostgreSQL. */
  createConfigurationRepository?: (db: Database, audit: AuditService) => ConfigurationRepository;
  createAdministrationRepository?: (db: Database) => AdministrationRepository;
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
    const signer = createInstanceSigner(environment.AUTH_SECRET);
    const instances = new InstanceService({
      origin: environment.AUTH_URL,
      repository: createInstanceRepository(db),
      digest: instanceDigest,
      verify: verifyProof,
      issue: (binding) => signer.issue(binding),
      issuerKey: signer.publicKey,
    });
    const access = createAccessPolicy();
    const administration = (
      resources.createAdministrationRepository ?? createAdministrationRepository
    )(db);
    const audit = new AuditService(administration);
    const configuration = createConfigurationService({
      repository: (resources.createConfigurationRepository ?? createConfigurationRepository)(
        db,
        audit,
      ),
      audit,
      access,
      cache,
    });
    const repository = createControlRepository(db);
    const projects = new ControlProjects(repository);
    const memory = new ContextLibraryService({
      repository: (resources.createContextRepository ?? createContextRepository)(db),
      scope: "account",
      validateProject: (owner, target) => projects.validateContextProject(owner, target),
    });
    const control = new ControlService(
      repository,
      Date.now,
      (owner, selection, target, prompt) => memory.resolve(owner, selection, target, prompt),
      projects,
    );
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
        control.credentials.revokeHostAuthorizations(userId, sessionId),
      registrationAllowed: async () => (await configuration.read()).values.registrationEnabled,
      siteName: () =>
        configuration.readCached().then(
          (snapshot) => snapshot.values.siteName,
          () => configurationDefaults.siteName,
        ),
      database: createAuditedAuthAdapter(db, audit),
      mailer,
      ...(secondaryStorage ? { secondaryStorage } : {}),
      config: createAuthConfig(environment),
    });
    // Resolve from the same auth adapter for HTTP and direct server callers.
    // Keep sessions request-owned even when the process reuses the runtime.
    const readSession = (headers: Headers) => readAuthSession(auth, headers);
    return {
      auth,
      audit,
      administration,
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
        instances,
        audit,
        administration,
        access,
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
