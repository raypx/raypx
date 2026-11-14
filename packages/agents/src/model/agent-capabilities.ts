import type { AgentId } from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";
import type { Skill, SkillCatalogEntry } from "@raypx/core/skills";
import type { McpServer } from "@raypx/core/mcp-servers";

export interface AgentSkillsPort {
  list(this: void, input: { spaceId: SpaceId; availableOnly: boolean }): Promise<Skill[]>;
  agentSkills(
    this: void,
    input: { spaceId: SpaceId; agentId: AgentId },
  ): Promise<SkillCatalogEntry[]>;
  setAgentSkills(
    this: void,
    input: { spaceId: SpaceId; agentId: AgentId; ids: string[] },
  ): Promise<SkillCatalogEntry[]>;
}
export interface AgentMcpPort {
  list(this: void, input: Record<string, never>): Promise<McpServer[]>;
  enabled(this: void, input: { spaceId: SpaceId; agentId: AgentId }): Promise<string[]>;
  setEnabled(
    this: void,
    input: { spaceId: SpaceId; agentId: AgentId; serverIds: string[] },
  ): Promise<string[]>;
}
export interface AgentCapabilitySelection {
  skillIds: string[];
  serverIds: string[];
}
export interface AgentCapabilitiesPort {
  skills?: AgentSkillsPort;
  mcpServers?: AgentMcpPort;
}
export async function loadAgentCapabilities(
  port: AgentCapabilitiesPort,
  spaceId: SpaceId,
  agentId?: AgentId,
): Promise<{ skills: Skill[]; servers: McpServer[]; selection: AgentCapabilitySelection }> {
  const [skills, servers, enabledSkills, enabledServers] = await Promise.all([
    port.skills?.list({ spaceId, availableOnly: true }) ?? [],
    port.mcpServers?.list({}) ?? [],
    agentId ? (port.skills?.agentSkills({ spaceId, agentId }) ?? []) : [],
    agentId ? (port.mcpServers?.enabled({ spaceId, agentId }) ?? []) : [],
  ]);
  return {
    skills,
    servers: servers.filter(
      (server) =>
        server.availability.mode === "all" || server.availability.spaceIds.includes(spaceId),
    ),
    selection: { skillIds: enabledSkills.map((skill) => skill.id), serverIds: enabledServers },
  };
}
export async function saveAgentCapabilities(
  port: AgentCapabilitiesPort,
  spaceId: SpaceId,
  agentId: AgentId,
  selection: AgentCapabilitySelection,
) {
  await Promise.all([
    port.skills?.setAgentSkills({ spaceId, agentId, ids: selection.skillIds }),
    port.mcpServers?.setEnabled({ spaceId, agentId, serverIds: selection.serverIds }),
  ]);
}
