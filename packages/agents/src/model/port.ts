import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import type {
  Agent,
  AgentId,
  AgentInput,
  Conversation,
  ConversationId,
  GroupConversationInput,
} from "@raypx/core/agents";
import type {
  MemberMessageInput,
  Message,
  ReplySegment,
  Run,
  ActiveRun,
  RunId,
  ToolActivity,
  ConversationMember,
  ResolvedApprovalSummary,
  ConversationHistoryCursor,
} from "@raypx/core/conversation";
import type { Space, SpaceId, SpaceInput, SpaceMember } from "@raypx/core/spaces";
import type { SpaceComputer } from "@raypx/core/computers";
import type {
  ApprovalRequest,
  ApprovalSettingsState,
  Effect,
  EffectiveApprovalMode,
} from "@raypx/core/approvals";
import type { RoutinesPort } from "@raypx/jobs/model";
import type { SpaceMemoryClientPort } from "@raypx/memory/model";
import type { ComputerFilesPort } from "./computer-files.js";
import type { AgentSkillsPort, AgentMcpPort } from "./agent-capabilities.js";
import type { SpaceManagementPort } from "./space-management.js";

export interface ApprovalPort {
  effectiveMode?(this: void, input: { spaceId: SpaceId }): Promise<EffectiveApprovalMode>;
  pending(this: void, input: { spaceId: SpaceId }): Promise<ApprovalRequest[]>;
  answer(
    this: void,
    input: {
      spaceId: SpaceId;
      requestId: ApprovalRequest["id"];
      decision: "approved" | "denied";
      allowTool?: boolean;
    },
  ): Promise<ApprovalRequest>;
  effects(this: void, input: { spaceId: SpaceId; runId: RunId }): Promise<Effect[]>;
}

export interface ComputerPort extends Partial<ComputerFilesPort> {
  get(this: void, input: { spaceId: SpaceId }): Promise<SpaceComputer>;
  start(this: void, input: { spaceId: SpaceId }): Promise<SpaceComputer>;
  stop(this: void, input: { spaceId: SpaceId }): Promise<SpaceComputer>;
}

export interface ConversationSelection {
  spaceId: SpaceId;
  conversationId: ConversationId;
}
export interface ConversationOwner {
  origin: string;
  accountId: string;
}
export interface ConversationSnapshot {
  conversation: Conversation;
  messages: Message[];
  runs: Run[];
  activeRuns?: ActiveRun[] | undefined;
  activeRunsTruncated?: boolean | undefined;
  segments: ReplySegment[];
  cursor: number;
  toolActivity?: ToolActivity[] | undefined;
  toolActivityTruncated?: boolean | undefined;
  participants?: ConversationMember[] | undefined;
  participantsTruncated?: boolean | undefined;
  resolvedApprovals?: ResolvedApprovalSummary[] | undefined;
  resolvedApprovalsTruncated?: boolean | undefined;
}
export interface ConversationHistory extends ConversationSnapshot {
  olderCursor: ConversationHistoryCursor | null;
  runsTruncated: boolean;
  segmentsTruncated: boolean;
}
export interface ConversationPort {
  history?(
    this: void,
    input: ConversationSelection & { limit?: number; before?: ConversationHistoryCursor },
  ): Promise<ConversationHistory>;
  snapshot(this: void, input: ConversationSelection): Promise<ConversationSnapshot>;
  send(
    this: void,
    input: ConversationSelection & { message: MemberMessageInput },
  ): Promise<Message>;
  stop(this: void, input: ConversationSelection & { runId: RunId }): Promise<Run>;
}
export interface ConversationSocket {
  send(this: void, frame: ConversationClientFrame): void;
  close(): void;
}
export interface ConversationSocketPort {
  connect(callbacks: {
    onFrame(frame: ConversationServerFrame): void;
    onClose(code?: number, reason?: string): void;
    onError(): void;
  }): ConversationSocket;
}
/** Device storage adapter. No browser or platform implementation enters the model. */
export interface ConversationDraftStore {
  read(this: void, key: string): string | null;
  write(this: void, key: string, value: string): void;
  remove(this: void, key: string): void;
}
export interface SpaceMembership {
  space: Space;
  member: SpaceMember;
}
export interface AgentConversationView {
  agent: Agent;
  conversation: Conversation;
}
export interface GroupConversationView {
  conversation: Conversation;
  agents: Agent[];
}
export interface GroupsPort {
  createGroup(
    this: void,
    input: GroupConversationInput & { spaceId: SpaceId },
  ): Promise<Conversation>;
  listGroups(this: void, input: { spaceId: SpaceId; limit?: number }): Promise<Conversation[]>;
  getGroup(this: void, input: ConversationSelection): Promise<Conversation>;
  renameGroup(this: void, input: ConversationSelection & { name: string }): Promise<Conversation>;
  addGroupAgent(
    this: void,
    input: ConversationSelection & { agentId: AgentId },
  ): Promise<Conversation>;
  removeGroupAgent(
    this: void,
    input: ConversationSelection & { agentId: AgentId },
  ): Promise<Conversation>;
  deleteGroup(this: void, input: ConversationSelection): Promise<{ deleted: true }>;
}
export interface OfferedModel {
  source: "connection" | "deployment";
  modelId: string;
  name: string;
}
/** Resource selectors never grant admission; the backend authorizes every request. */
export interface AgentsWorkspacePort {
  skills?: AgentSkillsPort;
  mcpServers?: AgentMcpPort;
  groups?: GroupsPort;
  spaceManagement?: SpaceManagementPort;
  accountApprovalSettings?: {
    settings(input: Record<string, never>): Promise<ApprovalSettingsState>;
  };
  routines?: RoutinesPort;
  spaceMemory?: SpaceMemoryClientPort;
  approvals?: ApprovalPort;
  computers: ComputerPort;
  spaces: {
    list(input: Record<string, never>): Promise<SpaceMembership[]>;
    create(input: SpaceInput): Promise<SpaceMembership>;
  };
  agents: {
    list(input: { spaceId: SpaceId; limit?: number }): Promise<AgentConversationView[]>;
    create(input: { spaceId: SpaceId; agent: AgentInput }): Promise<AgentConversationView>;
    update(input: {
      spaceId: SpaceId;
      id: AgentId;
      agent: AgentInput;
    }): Promise<AgentConversationView>;
    delete(input: { spaceId: SpaceId; id: AgentId }): Promise<{ deleted: true }>;
    models(input: { spaceId: SpaceId }): Promise<OfferedModel[]>;
  };
  conversations: ConversationPort;
}
