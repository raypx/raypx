import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import {
  ConversationRunner,
  createComputerTools,
  createApprovalsService,
} from "@raypx/agents/server";
import {
  createConversationsRepository,
  createApprovalsRepository,
  createComputerUseQueue,
  cancelSpaceRuns,
} from "@raypx/agents/server/postgres";
import { createSpaceManagement } from "@raypx/spaces/server/postgres";
import type { Database } from "@raypx/database/connection";
import { createSpaceMemoryService } from "@raypx/memory/space-server";
import { createSpaceMemoryRepository } from "@raypx/memory/space-server/postgres";
import { createRoutinesService } from "@raypx/jobs/routines";
import { createRoutinesRepository } from "@raypx/jobs/routines/postgres";
import type { ConversationId } from "@raypx/core/agents";
import { withMemoryTools } from "../conversations/memory-tools.js";
import { createPagesService } from "@raypx/pages/server";
import { createPagesRepository } from "@raypx/pages/server/postgres";
import { createSkillsService } from "@raypx/skills/server";
import { createSkillsRepository } from "@raypx/skills/server/postgres";
import { withPageTools } from "../conversations/page-tools.js";
import { withSkillTools } from "../conversations/skill-tools.js";
import { withMcpTools } from "../conversations/mcp-tools.js";
import { createMcpServers } from "../conversations/mcp-servers.js";
import { createMcpServersRepository } from "../conversations/mcp-postgres.js";
import { createMcpTransport } from "@raypx/providers/mcp";
import { createRoutineWorker } from "../routines/worker.js";
import { createSpaceDeletionWorker } from "../spaces/deletion-worker.js";
import { createDeploymentModels, type ConversationModels } from "../conversations/models.js";
import type { ApiLogging } from "../logging.js";
import { createModelConnections } from "../conversations/connections.js";
import { createModelConnectionsRepository } from "../conversations/connections-postgres.js";
import { createConnectionTransport } from "../conversations/connection-transport.js";
import {
  applicationSecretKeyProvider,
  createPostgresSecretStore,
  sealStoredSecret,
  openStoredSecret,
} from "../conversations/secrets.js";
import {
  configuredComputerProvider,
  knownComputerSecrets,
  type AgentEnvironment,
} from "./computers.js";

/** Shared by API direct dispatch and worker recovery. Composition performs no database I/O. */
export async function composeAgents(
  db: Database,
  environment: AgentEnvironment,
  logger: ApiLogging,
  createModels?: () => ConversationModels,
) {
  const computerProvider = await configuredComputerProvider(environment);
  const computers = createComputersService(
    createComputersRepository(db, {
      perSpace: environment.COMPUTERS_PER_SPACE,
      perMember: environment.COMPUTERS_PER_MEMBER,
    }),
    computerProvider,
  );
  const modelConnections = createModelConnections(
    createModelConnectionsRepository(db),
    createPostgresSecretStore(db, applicationSecretKeyProvider(environment.APP_KEY)),
    createConnectionTransport(),
  );
  const conversationModels =
    createModels?.() ??
    modelConnections.models(
      createDeploymentModels(environment.AGENT_MODELS, environment.AGENT_MODEL_CREDENTIALS),
    );
  const agentApprovals = createApprovalsService(createApprovalsRepository(db), {
    defaultMode: environment.APPROVAL_DEFAULT_MODE,
    requestTtlMs: environment.APPROVAL_REQUEST_TTL_MS,
  });
  const repository = createConversationsRepository(db, undefined, {
    timeoutMs: environment.RUN_ATTEMPT_TIMEOUT_MS,
    backupMarginMs: environment.RUN_BACKUP_MARGIN_MS,
  });
  const deploymentSecrets = knownComputerSecrets(environment);
  const spaceMemory = createSpaceMemoryService(createSpaceMemoryRepository(db));
  const keys = applicationSecretKeyProvider(environment.APP_KEY);
  const pages = createPagesService(createPagesRepository(db));
  const skills = createSkillsService(createSkillsRepository(db));
  const mcpServers = createMcpServers(createMcpServersRepository(db), keys, createMcpTransport());
  const protectedValues = () => [
    ...deploymentSecrets,
    ...modelConnections.protectedValues(),
    ...mcpServers.protectedValues(),
  ];
  const memoryTools = withMemoryTools(
    createComputerTools(
      computers,
      computerProvider,
      protectedValues,
      repository.pinResources,
      createComputerUseQueue(db),
    ),
    spaceMemory,
    protectedValues,
  );
  const tools = withMcpTools(
    withSkillTools(withPageTools(memoryTools, pages, protectedValues), skills, protectedValues),
    mcpServers,
    protectedValues,
  );
  const runner = new ConversationRunner(
    repository,
    conversationModels,
    (code) => logger.createLogger({ operation: "run.execution" }).emit({ status: 503, code }),
    (operation, runId, durationMs, timings) =>
      logger
        .createLogger({ operation })
        .emit({ status: 200, code: "OK", runId, durationMs, ...timings }),
    { tools, approvals: agentApprovals },
    {
      leaseMs: environment.RUN_LEASE_MS,
      heartbeatMs: environment.RUN_HEARTBEAT_MS,
      scanIntervalMs: environment.RUN_RECOVERY_INTERVAL_MS,
      attemptTimeoutMs: environment.RUN_ATTEMPT_TIMEOUT_MS,
      backupMarginMs: environment.RUN_BACKUP_MARGIN_MS,
      recallMemory: (scope, run) => spaceMemory.recall(scope, run.agentId),
      loadSkills: (scope, run) => skills.runCatalog(scope, run.agentId),
    },
  );
  const routines = createRoutinesService(
    createRoutinesRepository(db, {
      backupDelayMs: environment.RUN_ATTEMPT_TIMEOUT_MS + environment.RUN_BACKUP_MARGIN_MS,
      onEvent: ({ kind, id: _id, ...fields }) =>
        logger.createLogger({ operation: kind }).emit({ status: 200, code: "OK", ...fields }),
    }),
    {
      dispatch: (scope, id) => runner.dispatch(scope, id as ConversationId),
      secrets: {
        seal: (accountId, secretId, value) => sealStoredSecret(keys, accountId, secretId, value),
        open: (accountId, secretId, sealed) => openStoredSecret(keys, accountId, secretId, sealed),
      },
      ...(environment.ROUTINE_EMAIL_DOMAIN
        ? { emailDomain: environment.ROUTINE_EMAIL_DOMAIN }
        : {}),
      ...(environment.publicApiOrigin ? { publicApiOrigin: environment.publicApiOrigin } : {}),
    },
  );
  const routineWorker = createRoutineWorker(routines, environment.RUN_RECOVERY_INTERVAL_MS, () =>
    logger
      .createLogger({ operation: "run.execution" })
      .emit({ status: 503, code: "EXECUTION_FAILED" }),
  );
  const spaceManagement = createSpaceManagement(db, {
    beforeMemberRemoved: cancelSpaceRuns,
    afterMemberRemoved: (scope, accountId) => runner.cancelMember(scope.spaceId, accountId),
    afterDeletionClaimed: (spaceId) => runner.cancelMember(spaceId),
  });
  const spaceDeletionWorker = createSpaceDeletionWorker(db, computerProvider, {
    intervalMs: environment.RUN_RECOVERY_INTERVAL_MS,
    onError: () =>
      logger
        .createLogger({ operation: "run.execution" })
        .emit({ status: 503, code: "EXECUTION_FAILED" }),
  });
  return {
    pages,
    skills,
    mcpServers,
    spaceManagement,
    spaceDeletionWorker,
    routines,
    spaceMemory,
    routineWorker,
    runner,
    computers,
    computerProvider,
    conversationModels,
    agentApprovals,
    modelConnections,
  };
}
