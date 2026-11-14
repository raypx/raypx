import type { ConversationModels } from "../conversations/models.js";
import { composeAgents } from "./agents.js";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createAgentsRepository } from "@raypx/agents/server/postgres";
import { createConfigRepository } from "../config/repository.js";
import { createAccessPolicy } from "../access.js";
import { createConfigService } from "../config/service.js";
import { createConfigReads } from "../config/reads.js";
import { createResendSettings, databaseMailer } from "../config/resend.js";
import type { ConfigRepository } from "../config/types.js";
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
import { createStorageSettings } from "../storage/config.js";

export interface RuntimeProviders {
  createModels?: () => ConversationModels;
  createConversationFanout?: () => import("@raypx/agents/server").ConversationFanout;
  createSpaceFanout?: () => import("@raypx/spaces/server").SpaceFanout;
  /** Called once per runtime with its owned connection; defaults to PostgreSQL. */
  createConfigRepository?: (db: Database, audit: AuditService) => ConfigRepository;
  createAdministrationRepository?: (db: Database) => AdministrationRepository;
  /** Override the database-configured S3 provider for attachments. */
}

export interface RuntimeResources extends RuntimeProviders {
  logger: ApiLogging;
  /** Header owned by the platform entry, independently of configurable auth forwarding headers. */
  clientIpHeader?: string;
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
    async function revokeDeviceComputers(accountId: string) {
      await deviceComputersRepository.revokeAccount(accountId);
    }
    const auth = createAuth({
      revokeDeviceConnectors: async (userId) => {
        await revokeDeviceComputers(userId);
      },
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
    const {
      runner,
      deviceComputers,
      deviceComputersRepository,
      deviceConnector,
      computerProvider,
      computers,
      computerScreens,
      conversationModels,
      agentApprovals,
      protectedInputs,
      modelConnections,
      routines,
      spaceMemory,
      pages,
      skills,
      mcpServers,
      openApiServers,
      routineWorker,
      spaceManagement,
      spaceDeletionWorker,
    } = await composeAgents(db, environment, logger, resources.createModels);
    lifecycle.own(() => deviceConnector.shutdown());
    lifecycle.own(() => runner.close());
    lifecycle.own(() => routineWorker.close());
    lifecycle.own(() => spaceDeletionWorker.close());
    const conversations = runner.conversations;
    return {
      deviceComputers,
      deviceComputersRepository,
      deviceConnector,
      pages,
      skills,
      mcpServers,
      openApiServers,
      routines,
      spaceMemory,
      routineWorker,
      spaceManagement,
      spaceDeletionWorker,
      modelConnections,
      agentApprovals,
      protectedInputs,
      runner,
      stopClaiming: () => {
        routineWorker.stop();
        spaceDeletionWorker.stop();
        runner.stopClaiming();
      },
      computers,
      computerScreens,
      spaces,
      liveReplies: runner.live,
      conversations,
      auth,
      audit,
      administration,
      config,
      readSession,
      jobs: {
        cleanup: createCleanupJob({
          db,
          logger,
          configuration: config,
          enabled: environment.JOBS_ENABLED,
        }),
      },
      app: createApiApp({
        deviceComputers,
        deviceConnector,
        pages,
        skills,
        mcpServers,
        openApiServers,
        routines,
        spaceMemory,
        ...(environment.ROUTINE_EMAIL_RELAY_TOKEN
          ? { routineEmailRelayToken: environment.ROUTINE_EMAIL_RELAY_TOKEN }
          : {}),
        modelConnections,
        agentApprovals,
        protectedInputs,
        computers,
        computerScreens,
        spaces,
        spaceManagement,
        conversations,
        conversationModels,
        agents: createAgentsRepository(db),
        audit,
        administration,
        access,
        ...(resources.clientIpHeader ? { clientIpHeader: resources.clientIpHeader } : {}),
        config,
        storageSettings: createStorageSettings(db, environment.APP_KEY, audit, reads),
        resendSettings: createResendSettings(db, environment.APP_KEY, audit, reads),
        jobsEnabled: environment.JOBS_ENABLED,
        authHandler: (request) => auth.handler(request),
        readSession,
        allowedOrigins: environment.allowedOrigins,
        mailAvailable: mailer.available,
        logger,
        readiness: {
          ...readiness,
          ...(environment.SERVER_ROLE === "all" && environment.REDIS_URL
            ? {
                relay: async () => {
                  if (!deviceConnector.ready()) throw new Error("Connector unavailable");
                },
              }
            : {}),
          ...(computerProvider ? { sandbox: () => computerProvider.describe() } : {}),
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
