import { vi } from "vitest";
import { spaceIdSchema, spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { agentIdSchema } from "@raypx/core/agents";
import { pageSchema } from "@raypx/core/pages";
import { skillSchema, type SkillAvailability } from "@raypx/core/skills";
import { mcpServerSchema } from "@raypx/core/mcp-servers";
import { openApiServerSchema } from "@raypx/core/openapi-servers";
import type { MobileResourcesController } from "../src/resources/controllers.js";

const date = "2026-11-14T00:00:00.000Z";
export const spaceId = spaceIdSchema.parse("space-one");
export const agentId = agentIdSchema.parse("agent-one");
export const page = pageSchema.parse({
  id: "page-one",
  spaceId,
  agentId: null,
  title: "Notes",
  kind: "document",
  version: 2,
  createdAt: date,
  updatedAt: date,
});
export const skill = skillSchema.parse({
  id: "skill-one",
  name: "Read carefully",
  description: "Check sources",
  body: "Untrusted reference",
  ownership: "account",
  availability: { mode: "all" },
  spaceId: null,
  agentId: null,
  createdAt: date,
  updatedAt: date,
});
export const server = mcpServerSchema.parse({
  id: "b3fa7b61-6718-4814-8048-e1c8439f721a",
  name: "Library",
  transport: "http",
  url: "https://tools.raypx.test/mcp",
  availability: { mode: "all" },
  hasCredentials: true,
  createdAt: date,
  updatedAt: date,
});
const api = openApiServerSchema.parse({
  id: "b3fa7b61-6718-4814-8048-e1c8439f721b",
  spaceId,
  name: "Documents API",
  url: "https://tools.raypx.test/api",
  availability: { mode: "selected", agentIds: [agentId] },
  hasCredentials: true,
  selectedOperationIds: ["read", "write"],
  operations: [
    {
      operationId: "read",
      label: "Read document",
      method: "GET",
      path: "/documents",
      readOnly: true,
    },
    {
      operationId: "write",
      label: "Save document",
      method: "POST",
      path: "/documents",
      readOnly: false,
    },
  ],
  createdAt: date,
  updatedAt: date,
});
export const membership = {
  space: spaceSchema.parse({ id: spaceId, name: "Space", createdAt: date, updatedAt: date }),
  member: spaceMemberSchema.parse({ spaceId, accountId: "member", role: "owner", createdAt: date }),
};

export function resourcePorts() {
  let skillIds: string[] = [];
  let serverIds: string[] = [];
  let currentSkill = skill;
  let currentServer = server;
  const skills = {
    list: vi.fn(async () => [currentSkill]),
    get: vi.fn(async () => currentSkill),
    create: vi.fn(async () => currentSkill),
    update: vi.fn(async () => currentSkill),
    delete: vi.fn(async () => ({ deleted: true as const })),
    setAvailability: vi.fn(async (input: { availability: SkillAvailability }) => {
      currentSkill = { ...currentSkill, availability: input.availability };
      return currentSkill;
    }),
    import: vi.fn(async () => ({ skill: currentSkill, omitted: [] })),
    agentSkills: vi.fn(async () =>
      skillIds.map(() => ({ id: skill.id, name: skill.name, description: skill.description })),
    ),
    setAgentSkills: vi.fn(async (input: { ids: string[] }) => {
      skillIds = input.ids;
      return skillIds.map(() => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
      }));
    }),
  };
  const mcpServers = {
    list: vi.fn(async () => [currentServer]),
    create: vi.fn(async () => currentServer),
    update: vi.fn(async () => currentServer),
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({ code: "SUCCEEDED" as const, toolNames: [] })),
    setAvailability: vi.fn(async (input: { availability: SkillAvailability }) => {
      currentServer = { ...currentServer, availability: input.availability };
      return currentServer;
    }),
    enabled: vi.fn(async () => serverIds),
    setEnabled: vi.fn(async (input: { serverIds: string[] }) => {
      serverIds = input.serverIds;
      return serverIds;
    }),
  };
  return {
    skills,
    mcpServers,
    openApiServers: {
      list: vi.fn(async () => [api]),
      create: vi.fn(async () => api),
      update: vi.fn(async () => api),
      delete: vi.fn(async () => ({ deleted: true as const })),
      test: vi.fn(async () => ({ code: "SUCCEEDED" as const, operationIds: [] })),
    },
    directory: {
      spaces: { list: vi.fn(async () => [membership]) },
      agents: { list: vi.fn(async () => []) },
    },
    capabilities: { skills, mcpServers },
  } satisfies ConstructorParameters<typeof MobileResourcesController>[0];
}
