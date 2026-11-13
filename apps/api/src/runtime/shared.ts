import { InstanceService } from "@raypx/instances/server";
import { createInstanceSigner, instanceDigest, verifyProof } from "@raypx/instances/crypto";
import { createInstanceRepository } from "../instances/repository.js";
import { createConfigurationRepository } from "../config/repository.js";
import { createAccessPolicy } from "../access.js";
import { createConfigurationService } from "../config/service.js";
import { createConfigurationReads } from "../config/reads.js";
import { createResendSettings, databaseMailer } from "../config/resend.js";
import type { ConfigurationRepository } from "../config/types.js";
import type { ObjectStorage } from "@raypx/storage";
import { createControlRepository } from "@raypx/control/postgres";
import { createContextRepository } from "@raypx/memory/server/postgres";
import { ControlService, ControlProjects } from "@raypx/control";
import { createAuditedAuthAdapter } from "../admin/auth-adapter.js";
import {
  createAdministrationRepository,
  type AdministrationRepository,
} from "../admin/repository.js";
import { AuditService } from "../admin/audit.js";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import type { Database, DatabaseConnection } from "@raypx/database/connection";
import { configurationDefaults } from "@raypx/contracts/api";
import type { ApiLogging } from "../logging.js";
import { createApiApp } from "../routers/index.js";
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
import { JobError } from "@raypx/core/jobs";
import { createCloudJobsRepository } from "@raypx/jobs/server/postgres";
import { createScheduleTick } from "../jobs/tick.js";
import { ContextLibraryService, type ContextLibraryRepository } from "@raypx/memory/server";
import { createStorageSettings, databaseStorage } from "../storage/config.js";
import { createSessionAttachments, withSessionAttachments } from "../storage/attachments.js";

export interface RuntimeProviders {
  /** Called once per runtime with its owned connection; defaults to PostgreSQL. */
  createConfigurationRepository?: (db: Database, audit: AuditService) => ConfigurationRepository;
  createAdministrationRepository?: (db: Database) => AdministrationRepository;
  createJobsRepository?: (db: Database) => CloudJobsRepository;
  createContextRepository?: (db: Database) => ContextLibraryRepository;
  /** Override the database-configured S3 provider for attachments. */
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
  /** Owned by the runtime: sessions, rate limits and configuration notifications. */
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
    const { secondaryStorage, rateLimit, readiness } = createAdapters(environment, db, redis);
    const reads = createConfigurationReads(redis?.configurationNotifications);
    lifecycle.own(async () => reads.close());
    const mailer = databaseMailer(db, environment.AUTH_SECRET, reads);
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
      reads,
    });
    const repository = createControlRepository(db);
    const projects = new ControlProjects(repository);
    const memory = new ContextLibraryService({
      repository: (resources.createContextRepository ?? createContextRepository)(db),
      scope: "account",
      validateProject: (owner, target) => projects.validateContextProject(owner, target),
    });
    const injectedStorage = resources.storage;
    const readInjectedStorage = async () => injectedStorage ?? null;
    const attachments = createSessionAttachments(
      db,
      injectedStorage
        ? { read: readInjectedStorage, readCached: readInjectedStorage }
        : databaseStorage(db, environment.AUTH_SECRET, reads),
      projects,
    );
    const resolveContext = withSessionAttachments(db, (owner, selection, target, prompt) =>
      memory.resolve(owner, selection, target, prompt),
    );
    const control = new ControlService(repository, Date.now, resolveContext, projects);
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
      attachments,
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
        storageSettings: createStorageSettings(db, environment.AUTH_SECRET, audit, reads),
        resendSettings: createResendSettings(db, environment.AUTH_SECRET, audit, reads),
        jobsEnabled: environment.JOBS_ENABLED,
        control,
        cloudJobs,
        memory,
        attachments,
        resolveContext,
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
