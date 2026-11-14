import { expect, it, vi } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import { mcpServerSchema } from "@raypx/core/mcp-servers";
import { skillSchema } from "@raypx/core/skills";
import {
  loadAgentCapabilities,
  saveAgentCapabilities,
  type AgentCapabilitiesPort,
} from "./agent-capabilities.js";
const spaceId = spaceIdSchema.parse("space");
const agentId = agentIdSchema.parse("agent");
const time = "2026-11-14T00:00:00Z";
it("loads available skills and servers and saves the member's exact per-Agent selection", async () => {
  const skill = skillSchema.parse({
    id: "notes",
    name: "Notes",
    description: "Notes skill",
    body: "# Notes",
    ownership: "space",
    spaceId,
    agentId,
    availability: { mode: "all" },
    createdAt: time,
    updatedAt: time,
  });
  const server = mcpServerSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Research",
    url: "https://example.com/mcp",
    transport: "http",
    availability: { mode: "selected", spaceIds: [spaceId] },
    hasCredentials: false,
    createdAt: time,
    updatedAt: time,
  });
  const port: AgentCapabilitiesPort = {
    skills: {
      list: vi.fn(async () => [skill]),
      agentSkills: vi.fn(async () => [skill]),
      setAgentSkills: vi.fn(async () => [skill]),
    },
    mcpServers: {
      list: vi.fn(async () => [
        server,
        {
          ...server,
          id: "00000000-0000-4000-8000-000000000002",
          availability: { mode: "selected" as const, spaceIds: [] },
        },
      ]),
      enabled: vi.fn(async () => [server.id]),
      setEnabled: vi.fn(async () => []),
    },
  };
  const view = await loadAgentCapabilities(port, spaceId, agentId);
  expect(view.skills).toEqual([skill]);
  expect(view.servers).toEqual([server]);
  expect(view.selection).toEqual({ skillIds: [skill.id], serverIds: [server.id] });
  expect(port.skills?.list).toHaveBeenCalledWith({ spaceId, availableOnly: true });
  await saveAgentCapabilities(port, spaceId, agentId, { skillIds: [], serverIds: [server.id] });
  expect(port.skills?.setAgentSkills).toHaveBeenCalledWith({ spaceId, agentId, ids: [] });
  expect(port.mcpServers?.setEnabled).toHaveBeenCalledWith({
    spaceId,
    agentId,
    serverIds: [server.id],
  });
});
it("keeps the shared model compatible when optional capability ports are absent", async () => {
  expect(await loadAgentCapabilities({}, spaceId)).toEqual({
    skills: [],
    servers: [],
    selection: { skillIds: [], serverIds: [] },
  });
  await expect(
    saveAgentCapabilities({}, spaceId, agentId, { skillIds: [], serverIds: [] }),
  ).resolves.toBeUndefined();
});
