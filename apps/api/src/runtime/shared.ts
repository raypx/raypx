import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { configuredComputerProvider } from "./computers.js";
import { ConversationRunner } from "@raypx/agents/server";
import { createDeploymentModels, type ConversationModels } from "../conversations/models.js";
import { InstanceService } from "@raypx/instances/server";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import {
  createConversationsRepository,
  createAgentsRepository,
} from "@raypx/agents/server/postgres";
import { createInstanceSigner, instanceDigest, verifyProof } from "@raypx/instances/crypto";
import { createInstanceRepository } from "../instances/repository.js";
import { createConfigRepository } from "../config/repository.js";
import { createAccessPolicy } from "../access.js";
import { createConfigService } from "../config/service.js";
import { createConfigReads } from "../config/reads.js";
import { createResendSettings, databaseMailer } from "../config/resend.js";
import type { ConfigRepository } from "../config/types.js";
import type { ObjectStorage } from "@raypx/storage";
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
import type { ContextLibraryRepository } from "@raypx/memory/server";
import { createStorageSettings, databaseStorage } from "../storage/config.js";
import { createSessionAttachments } from "../storage/attachments.js";
import { composeControl } from "./control.js";
import type { ControlService } from "@raypx/control";

export interface RuntimeProviders {
  createModels?: () => ConversationModels;
  createConversationFanout?: () => import("@raypx/agents/server").ConversationFanout;
  /** Called once per runtime with its owned connection; defaults to PostgreSQL. */
  createConfigRepository?: (db: Database, audit: AuditService) => ConfigRepository;
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
    const reads = createConfigReads(redis?.configNotifications);
    lifecycle.own(async () => reads.close());
    const mailer = databaseMailer(db, environment.APP_KEY, reads);
    const signer = createInstanceSigner(environment.APP_KEY);
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
    const config = createConfigService({
      repository: (resources.createConfigRepository ?? createConfigRepository)(db, audit),
      audit,
      access,
      reads,
    });
    const { control, projects, memory, resolveContext } = composeControl(
      db,
      resources.createContextRepository,
    );
    const injectedStorage = resources.storage;
    const readInjectedStorage = async () => injectedStorage ?? null;
    const attachments = createSessionAttachments(
      db,
      injectedStorage
        ? { read: readInjectedStorage, readCached: readInjectedStorage }
        : databaseStorage(db, environment.APP_KEY, reads),
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
      registrationAllowed: async () => (await config.read()).values.registrationEnabled,
      siteName: () =>
        config.readCached().then(
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
    const spaces = createSpaceAccess(db);
    const computerProvider = await configuredComputerProvider(environment);
    const computers = createComputersService(
      createComputersRepository(db, {
        perSpace: environment.COMPUTERS_PER_SPACE,
        perMember: environment.COMPUTERS_PER_MEMBER,
      }),
      computerProvider,
    );
    const conversationModels =
      resources.createModels?.() ??
      createDeploymentModels(environment.AGENT_MODELS, environment.AGENT_MODEL_CREDENTIALS);
    const runner = new ConversationRunner(
      createConversationsRepository(db),
      conversationModels,
      (code) => logger.createLogger({ operation: "run.execution" }).emit({ status: 503, code }),
      (operation, runId, durationMs) =>
        logger.createLogger({ operation }).emit({ status: 200, code: "OK", runId, durationMs }),
    );
    lifecycle.own(() => runner.close());
    const conversations = runner.conversations;
    return {
      computers,
      spaces,
      liveReplies: runner.live,
      conversations,
      auth,
      audit,
      administration,
      attachments,
      control,
      config,
      cloudJobs,
      memory,
      readSession,
      jobs: {
        cleanup: createCleanupJob({
          db,
          logger,
          configuration: config,
          enabled: environment.JOBS_ENABLED,
        }),
        tick: createScheduleTick(cloudJobs, logger, environment.JOBS_ENABLED),
      },
      app: createApiApp({
        computers,
        spaces,
        conversations,
        conversationModels,
        agents: createAgentsRepository(db),
        instances,
        audit,
        administration,
        access,
        ...(resources.clientIpHeader ? { clientIpHeader: resources.clientIpHeader } : {}),
        config,
        storageSettings: createStorageSettings(db, environment.APP_KEY, audit, reads),
        resendSettings: createResendSettings(db, environment.APP_KEY, audit, reads),
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
          ...(computerProvider ? { sandbox: () => computerProvider.describe() } : {}),
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
