import {
  agentIdSchema,
  conversationIdSchema,
  type AgentId,
  type ConversationId,
} from "@raypx/core/agents";
import { spaceIdSchema, type SpaceId } from "@raypx/core/spaces";
import type {
  AgentConversationView,
  GroupConversationView,
  OfferedModel,
  SpaceMembership,
} from "./port.js";

export interface AgentsPageState {
  spaces: SpaceMembership[];
  agents: AgentConversationView[];
  models: OfferedModel[];
  groups?: GroupConversationView[];
  groupId?: ConversationId | null;
  spaceId: SpaceId | null;
  agentId: AgentId | null;
}
export function createAgentsPageState(): AgentsPageState {
  return { spaces: [], agents: [], models: [], spaceId: null, agentId: null };
}
export function parseAgentSelection(search: Record<string, unknown>): {
  spaceId?: SpaceId;
  agentId?: AgentId;
  groupId?: ConversationId;
} {
  const spaceId = spaceIdSchema.safeParse(search.spaceId);
  const agentId = agentIdSchema.safeParse(search.agentId);
  const groupId = conversationIdSchema.safeParse(search.groupId);
  return {
    ...(spaceId.success ? { spaceId: spaceId.data } : {}),
    ...(agentId.success ? { agentId: agentId.data } : {}),
    ...(groupId.success ? { groupId: groupId.data } : {}),
  };
}
export function applySpaces(
  state: AgentsPageState,
  spaces: SpaceMembership[],
  preferredSpaceId?: string,
): AgentsPageState {
  const requested = preferredSpaceId ?? state.spaceId;
  const spaceId =
    spaces.find((item) => item.space.id === requested)?.space.id ?? spaces[0]?.space.id ?? null;
  if (spaceId === state.spaceId) return { ...state, spaces };
  return {
    ...state,
    spaces,
    spaceId,
    agentId: null,
    groupId: null,
    groups: [],
    agents: [],
    models: [],
  };
}
export function selectSpace(state: AgentsPageState, id: string): AgentsPageState {
  const space = state.spaces.find((item) => item.space.id === id);
  if (!space || state.spaceId === id) return state;
  return {
    ...state,
    spaceId: space.space.id,
    agentId: null,
    groupId: null,
    groups: [],
    agents: [],
    models: [],
  };
}
export function applyAgents(
  state: AgentsPageState,
  spaceId: string,
  agents: AgentConversationView[],
  preferredAgentId?: string,
): AgentsPageState {
  if (state.spaceId !== spaceId) return state;
  const requested = preferredAgentId ?? state.agentId;
  const agentId = agents.find((item) => item.agent.id === requested)?.agent.id ?? null;
  return { ...state, agents, agentId };
}
export function selectAgent(state: AgentsPageState, id: string): AgentsPageState {
  const item = state.agents.find((entry) => entry.agent.id === id);
  if (!item || state.agentId === id) return state;
  return { ...state, agentId: item.agent.id, groupId: null };
}

export function applyGroups(
  state: AgentsPageState,
  spaceId: string,
  groups: GroupConversationView[],
  preferredGroupId?: string,
): AgentsPageState {
  if (state.spaceId !== spaceId) return state;
  const requested = preferredGroupId ?? state.groupId;
  const groupId =
    groups.find((item) => item.conversation.id === requested)?.conversation.id ?? null;
  return { ...state, groups, groupId, ...(groupId ? { agentId: null } : {}) };
}
export function selectGroup(state: AgentsPageState, id: string): AgentsPageState {
  const item = state.groups?.find((entry) => entry.conversation.id === id);
  if (!item || state.groupId === id) return state;
  return { ...state, groupId: item.conversation.id, agentId: null };
}
