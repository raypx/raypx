import type {
  AgentId,
  GroupConversationInput,
  Conversation,
  ConversationId,
} from "@raypx/core/agents";
import type {
  ConversationEvent,
  MemberMessageInput,
  Message,
  Run,
  ActiveRun,
  RunId,
  RunFailure,
  ReplySegment,
  ToolActivity,
  ToolOutcome,
  ConversationMember,
  ResolvedApprovalSummary,
  ConversationHistoryCursor,
  ToolPage,
} from "@raypx/core/conversation";
import type { SpaceScope } from "@raypx/spaces/server";
import type { Message as ModelMessage, ToolCall } from "@raypx/ai";

export interface ConversationEventEntry {
  event: ConversationEvent;
  message?: Message;
}
export type ConversationEvents =
  | { status: "events"; events: ConversationEventEntry[]; cursor: number; hasMore: boolean }
  | { status: "snapshot-required"; cursor: number };
export interface ConversationSnapshot {
  conversation: Conversation;
  messages: Message[];
  runs: Run[];
  activeRuns?: ActiveRun[] | undefined;
  activeRunsTruncated?: boolean | undefined;
  segments: ReplySegment[];
  cursor: number;
  toolActivity?: ToolActivity[];
  toolActivityTruncated?: boolean;
  participants?: ConversationMember[];
  participantsTruncated?: boolean;
  resolvedApprovals?: ResolvedApprovalSummary[];
  resolvedApprovalsTruncated?: boolean;
}
export interface ConversationHistory extends ConversationSnapshot {
  olderCursor: ConversationHistoryCursor | null;
  runsTruncated: boolean;
  segmentsTruncated: boolean;
}
export interface ConversationsRepository {
  createGroup?(scope: SpaceScope, input: GroupConversationInput): Promise<Conversation>;
  listGroups?(scope: SpaceScope, limit: number): Promise<Conversation[]>;
  getGroup?(scope: SpaceScope, id: ConversationId): Promise<Conversation>;
  renameGroup?(scope: SpaceScope, id: ConversationId, name: string): Promise<Conversation>;
  addGroupAgent?(scope: SpaceScope, id: ConversationId, agentId: AgentId): Promise<Conversation>;
  removeGroupAgent?(scope: SpaceScope, id: ConversationId, agentId: AgentId): Promise<Conversation>;
  setGroupDefaultResponder?(
    scope: SpaceScope,
    id: ConversationId,
    agentId: AgentId | null,
  ): Promise<Conversation>;
  deleteGroup?(scope: SpaceScope, id: ConversationId): Promise<{ deleted: true }>;

  stop(scope: SpaceScope, id: ConversationId, runId: RunId): Promise<Run>;
  send(scope: SpaceScope, id: ConversationId, input: MemberMessageInput): Promise<Message>;
  events(
    scope: SpaceScope,
    id: ConversationId,
    after: number,
    limit: number,
  ): Promise<ConversationEvents>;
  snapshot(scope: SpaceScope, id: ConversationId): Promise<ConversationSnapshot>;
  history?(
    scope: SpaceScope,
    id: ConversationId,
    limit: number,
    before?: ConversationHistoryCursor,
  ): Promise<ConversationHistory>;
  /** Maintenance only. Removes a prefix atomically with its replay boundary; messages remain. */
  retainAfter(scope: SpaceScope, id: ConversationId, through: number): Promise<void>;
}
/** A hint, never the source of truth. No Space, account or message content is published. */
export interface ConversationNotice {
  conversationId: string;
  sequence: number;
}
export interface ConversationFanout {
  subscribe(listener: (notice: ConversationNotice) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

/** Private executor capability. Never serialized into the public Run projection. */
export interface ExecutionRun extends Run {
  ownerId: string;
  fence: number;
  attemptId: string;
  attemptNumber: number;
  timeoutAt: string;
  connectionId: string | null;
  computerId: string | null;
  computerGeneration: number | null;
  allowSharedMemory?: boolean;
  untrustedInput?: Run["untrustedInput"];
  originMessageId?: string | null;
  agentChainDepth?: number;
  delegationDepth?: number;
  instructionRevision?: number;
  delegationTask?: string | null;
  /** Pinned instructions and originating member request only; never persisted in review evidence. */
  trustedInstructionSummary?: string;
}
export class StaleRunFenceError extends Error {
  constructor() {
    super("STALE_RUN_FENCE");
    this.name = "StaleRunFenceError";
  }
}
export class RunResourceUnavailableError extends Error {
  constructor(
    readonly code: "CONNECTION_UNAVAILABLE" | "COMPUTER_UNAVAILABLE",
    readonly retryAt?: number,
  ) {
    super(code);
    this.name = "RunResourceUnavailableError";
  }
}
export interface RunCheckpoint {
  continuation: ModelMessage[];
  pendingCalls: ToolCall[];
  rounds: number;
  completed: boolean;
  /** Snapshot for inspection; effect rows remain authoritative for replay. */
  openEffects?: string[];
  untrustedInput?: boolean;
  memory?: {
    revisions: Array<{ documentId: string; revision: number }>;
    context: string;
    untrustedInput: boolean;
  };
  routineTiming?: { dueAt: string; startedAt: string; timezone: string; annotation: string };
  skills?: Array<{ id: string; name: string; description: string }>;
  /** Credential-free, frozen dynamic tool metadata. */
  toolCatalog?: unknown;
}
export interface RunExecution {
  /** Fresh admission for the Run's initiating member, independent of who woke it. */
  scope: SpaceScope;
  run: ExecutionRun;
  instructions: string;
  history: Array<{ role: "user" | "assistant"; text: string; createdAt: string }>;
  checkpoint: RunCheckpoint;
}
export interface RunClaimOptions {
  ownerId: string;
  leaseMs: number;
  timeoutMs: number;
  backupMarginMs: number;
}
export interface RunnableConversation {
  scope: SpaceScope;
  id: ConversationId;
}
export interface ToolSummary {
  toolCallId: string;
  toolName: string;
  target: string;
  argumentSummary: string;
}
export interface ToolCompletion {
  toolCallId: string;
  outcome: ToolOutcome;
  exitStatus: number | null;
  page?: ToolPage | null;
}
export interface DelegationInput {
  toolCallId: string;
  task: string;
  agentId?: string;
}
export interface AgentMessageInput {
  toolCallId: string;
  agentId: string;
  text: string;
  targetSpaceId?: string;
}
export class AgentInteractionError extends Error {
  constructor(
    readonly code:
      | "DELEGATION_DEPTH_LIMIT"
      | "DELEGATION_CONCURRENT_LIMIT"
      | "DELEGATION_TOTAL_LIMIT"
      | "AGENT_TARGET_UNAVAILABLE",
  ) {
    super(code);
    this.name = "AgentInteractionError";
  }
}
export interface ConversationRunRepository {
  setComputerInputPaused?(scope: SpaceScope, run: ExecutionRun, paused: boolean): Promise<void>;
  sendAgent?(scope: SpaceScope, run: ExecutionRun, input: AgentMessageInput): Promise<Message>;
  delegate?(
    scope: SpaceScope,
    run: ExecutionRun,
    input: DelegationInput,
  ): Promise<{ runId: RunId }>;
  consumeDelegations?(
    scope: SpaceScope,
    run: ExecutionRun,
    checkpoint: RunCheckpoint,
  ): Promise<{ checkpoint: RunCheckpoint; pending: boolean }>;
  hasPendingDelegations?(scope: SpaceScope, run: ExecutionRun): Promise<boolean>;

  beginTool(scope: SpaceScope, run: ExecutionRun, tool: ToolSummary): Promise<void>;
  claimNext(
    scope: SpaceScope,
    id: ConversationId,
    options: RunClaimOptions,
  ): Promise<RunExecution | undefined>;
  getRun(scope: SpaceScope, id: ConversationId, runId: RunId): Promise<Run>;
  /** First execution clock starts after the pinned computer has been acquired. */
  executionStarted(scope: SpaceScope, run: ExecutionRun): Promise<string>;
  heartbeat(scope: SpaceScope, run: ExecutionRun, leaseMs: number): Promise<boolean>;
  release(scope: SpaceScope, run: ExecutionRun): Promise<void>;
  scanRunnable(limit?: number): Promise<RunnableConversation[]>;
  claimBackupJobs(
    ownerId: string,
    leaseMs: number,
    limit?: number,
  ): Promise<RunnableConversation[]>;
  finish(
    this: void,
    scope: SpaceScope,
    run: ExecutionRun,
    failure: RunFailure | null,
    retryAt?: Date,
  ): Promise<boolean>;
  commitTurn(
    scope: SpaceScope,
    run: ExecutionRun,
    turn: {
      checkpoint: RunCheckpoint;
      tools?: ToolSummary[];
      segmentId?: string;
      text?: string;
      firstResponseAt?: string;
    },
  ): Promise<boolean>;
  saveCheckpoint(
    this: void,
    scope: SpaceScope,
    run: ExecutionRun,
    checkpoint: RunCheckpoint,
    tool?: ToolCompletion,
  ): Promise<void>;
  consumeSteering(
    scope: SpaceScope,
    run: ExecutionRun,
    checkpoint: RunCheckpoint,
  ): Promise<RunCheckpoint>;
  pinResources(
    this: void,
    scope: SpaceScope,
    run: ExecutionRun,
    pins: {
      connectionId?: string;
      computerId?: string;
      computerGeneration?: number;
    },
  ): Promise<void>;
}
