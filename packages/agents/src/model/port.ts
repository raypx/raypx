import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import type { Agent, AgentId, AgentInput, Conversation, ConversationId } from "@raypx/core/agents";
import type {
  MemberMessageInput,
  Message,
  ReplySegment,
  Run,
  RunId,
  ToolActivity,
} from "@raypx/core/conversation";
import type { Space, SpaceId, SpaceInput, SpaceMember } from "@raypx/core/spaces";
import type { SpaceComputer } from "@raypx/core/computers";
import type { ApprovalRequest, Effect } from "@raypx/core/approvals";
import type { RoutinesPort } from "@raypx/jobs/model";
import type { SpaceMemoryClientPort } from "@raypx/memory/model";
import type { ComputerFilesPort } from "./computer-files.js";

export interface ApprovalPort {
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
  segments: ReplySegment[];
  cursor: number;
  toolActivity?: ToolActivity[] | undefined;
  toolActivityTruncated?: boolean | undefined;
}
export interface ConversationPort {
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
    onClose(code?: number): void;
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
export interface OfferedModel {
  source: "connection" | "deployment";
  modelId: string;
  name: string;
}
/** Resource selectors never grant admission; the backend authorizes every request. */
export interface AgentsWorkspacePort {
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
