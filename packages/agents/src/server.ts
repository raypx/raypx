import type { Agent, AgentId, AgentInput, Conversation } from "@raypx/core/agents";
import type { SpaceScope } from "@raypx/spaces/server";

export interface AgentConversation {
  agent: Agent;
  conversation: Conversation;
}
export interface AgentsRepository {
  get(scope: SpaceScope, id: AgentId): Promise<AgentConversation>;
  list(scope: SpaceScope, limit: number): Promise<AgentConversation[]>;
  create(scope: SpaceScope, input: AgentInput): Promise<AgentConversation>;
  update(scope: SpaceScope, id: AgentId, input: AgentInput): Promise<AgentConversation>;
  delete(scope: SpaceScope, id: AgentId): Promise<{ deleted: true }>;
}

export type {
  ConversationsRepository,
  ConversationRunRepository,
  RunExecution,
  ExecutionRun,
  RunCheckpoint,
  ToolSummary,
  ToolCompletion,
  ConversationEventEntry,
  ConversationEvents,
  ConversationSnapshot,
  ConversationFanout,
  ConversationNotice,
} from "./conversations.js";

export { RunResourceUnavailableError, StaleRunFenceError } from "./conversations.js";

export {
  ConversationRunner,
  LiveReplies,
  type ModelAccess,
  type ModelTurn,
  type RunTools,
} from "./runner.js";
export {
  createApprovalsService,
  ApprovalOperationError,
  ApprovalSettingsConflictError,
  EffectUnknownError,
  EffectInProgressError,
  type ApprovalsService,
  type ApprovalsRepository,
  type ApprovalCall,
  type ApprovalAnswer,
  type ApprovalOutcome,
  type ApprovalSettingsInput,
  type ApprovalReviewModel,
  type ApprovalReviewModels,
} from "./approvals.js";
export {
  createComputerTools,
  ComputerToolsError,
  computerToolResult,
  type ComputerTools,
  type PreparedComputerCall,
  type ComputerScreenInputGate,
} from "./computer-tools.js";
export { EFFECT_INTENT_TIMEOUT_MS } from "./tool-limits.js";
export {
  ProtectedInputError,
  scrubProtectedOutput,
  type ProtectedInputsService,
  type ProtectedInputCipher,
} from "./protected-input.js";
