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
