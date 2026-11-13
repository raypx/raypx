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
} from "@raypx/agents/server/postgres";
import type { Database } from "@raypx/database/connection";
import { createDeploymentModels, type ConversationModels } from "../conversations/models.js";
import type { ApiLogging } from "../logging.js";
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
  const conversationModels =
    createModels?.() ??
    createDeploymentModels(environment.AGENT_MODELS, environment.AGENT_MODEL_CREDENTIALS);
  const agentApprovals = createApprovalsService(createApprovalsRepository(db), {
    defaultMode: environment.APPROVAL_DEFAULT_MODE,
    requestTtlMs: environment.APPROVAL_REQUEST_TTL_MS,
  });
  const repository = createConversationsRepository(db, undefined, {
    timeoutMs: environment.RUN_ATTEMPT_TIMEOUT_MS,
    backupMarginMs: environment.RUN_BACKUP_MARGIN_MS,
  });
  const tools = createComputerTools(
    computers,
    computerProvider,
    knownComputerSecrets(environment),
    repository.pinResources,
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
    },
  );
  return { runner, computers, computerProvider, conversationModels, agentApprovals };
}
