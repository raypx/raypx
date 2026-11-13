import { agentIdSchema, type AgentId } from "@raypx/core/agents";
import { spaceIdSchema, type SpaceId } from "@raypx/core/spaces";
import type { AgentConversationView, OfferedModel, SpaceMembership } from "./port.js";

export interface AgentsPageState {
  spaces: SpaceMembership[];
  agents: AgentConversationView[];
  models: OfferedModel[];
  spaceId: SpaceId | null;
  agentId: AgentId | null;
}
export function createAgentsPageState(): AgentsPageState {
  return { spaces: [], agents: [], models: [], spaceId: null, agentId: null };
}
export function parseAgentSelection(search: Record<string, unknown>): {
  spaceId?: SpaceId;
  agentId?: AgentId;
} {
  const spaceId = spaceIdSchema.safeParse(search.spaceId);
  const agentId = agentIdSchema.safeParse(search.agentId);
  return {
    ...(spaceId.success ? { spaceId: spaceId.data } : {}),
    ...(agentId.success ? { agentId: agentId.data } : {}),
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
  return { ...state, spaces, spaceId, agentId: null, agents: [], models: [] };
}
export function selectSpace(state: AgentsPageState, id: string): AgentsPageState {
  const space = state.spaces.find((item) => item.space.id === id);
  if (!space || state.spaceId === id) return state;
  return { ...state, spaceId: space.space.id, agentId: null, agents: [], models: [] };
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
  return { ...state, agentId: item.agent.id };
}
