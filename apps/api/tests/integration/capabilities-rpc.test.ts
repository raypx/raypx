import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient, type ApiClient } from "@raypx/client/api";
import { controlAuth } from "@raypx/control/testing";
import { agentIdSchema } from "@raypx/core/agents";
import {
  pageBodySchema,
  pageIdSchema,
  pageInputSchema,
  pageShareLinkSchema,
  pageVersionSchema,
} from "@raypx/core/pages";
import {
  skillAvailabilitySchema,
  skillContentSchema,
  skillIdSchema,
  skillImportInputSchema,
  skillSchema,
} from "@raypx/core/skills";
import {
  mcpCredentialHeadersSchema,
  mcpServerConfigurationSchema,
  mcpServerIdSchema,
  mcpServerSchema,
} from "@raypx/core/mcp-servers";
import { spaceIdSchema } from "@raypx/core/spaces";
import { resolveSpaceScope, type SpaceScope } from "@raypx/spaces/server";
import type { PagesService } from "@raypx/pages/server";
import type { SkillsService } from "@raypx/skills/server";
import type { McpServersService } from "../../src/conversations/mcp-servers.js";
import { createApiApp } from "../helpers/app.js";

const accountId = "capability-owner";
const spaceId = spaceIdSchema.parse("space-client-reporting");
const agentId = agentIdSchema.parse("agent-report-writer");
const pageId = pageIdSchema.parse("page-monthly-report");
const skillId = "skill-report-writing";
const serverId = "9ca1e9b4-9c65-4b96-b788-a0687737d624";
const now = "2026-11-14T12:00:00.000Z";
const expiresAt = "2050-11-14T12:00:00.000Z";
const availability = { mode: "selected" as const, spaceIds: [spaceId] };
const pageInput = {
  title: "Monthly report",
  kind: "document" as const,
  body: "# Monthly report\n\nWork completed this month.",
  agentId,
};
const page = pageVersionSchema.parse({
  ...pageInput,
  id: pageId,
  spaceId,
  version: 1,
  author: { kind: "member", accountId, runId: null },
  reason: "created",
  createdAt: now,
  updatedAt: now,
});
const { body: _pageBody, author: _pageAuthor, reason: _pageReason, ...pageMetadata } = page;
const { body: _versionBody, ...versionMetadata } = page;
const shareLink = pageShareLinkSchema.parse({
  id: "share-monthly-report",
  spaceId,
  pageId,
  version: 1,
  createdAt: now,
  expiresAt,
  revokedAt: null,
});
const issuedShareLink = { ...shareLink, token: "a".repeat(64) };
const skillInput = {
  name: "Reporting",
  description: "Prepare a clear monthly report.",
  body: "Summarize completed work and describe the next steps.",
};
const skill = skillSchema.parse({
  ...skillInput,
  id: skillId,
  ownership: "account",
  spaceId: null,
  agentId: null,
  availability,
  createdAt: now,
  updatedAt: now,
});
const catalog = [{ id: skillId, name: skill.name, description: skill.description }];
const skillPackage = {
  format: "markdown" as const,
  bytes: Buffer.from(
    "---\nname: Reporting\ndescription: Prepare a clear monthly report.\n---\nSummarize completed work.",
  ).toString("base64"),
};
const serverInput = {
  name: "Team reports",
  transport: "http" as const,
  url: "https://tools.example.test/mcp",
  availability,
};
const credentialHeaders = { authorization: "Bearer rpc-fixture-credential" };
const server = mcpServerSchema.parse({
  ...serverInput,
  id: serverId,
  hasCredentials: true,
  createdAt: now,
  updatedAt: now,
});
const positiveInteger = z.number().int().positive();
const scopedPageList = z.strictObject({
  agentId: agentIdSchema.optional(),
  limit: positiveInteger,
});

function fixture() {
  const auth = controlAuth(accountId);
  const scope = resolveSpaceScope(
    { spaceId, accountId, role: "owner", createdAt: now },
    accountId,
    spaceId,
  );
  function requireScope(value: SpaceScope) {
    expect(value).toBe(scope);
  }
  // These stubs validate the domain arguments, independently of the RPC input
  // schema. Forwarding the transport envelope into a strict domain input fails.
  const pages = {
    list: vi.fn<PagesService["list"]>(async (current, input) => {
      requireScope(current);
      scopedPageList.parse(input);
      return [pageMetadata];
    }),
    get: vi.fn<PagesService["get"]>(async (current, id, version) => {
      requireScope(current);
      pageIdSchema.parse(id);
      positiveInteger.optional().parse(version);
      return page;
    }),
    create: vi.fn<PagesService["create"]>(async (current, input) => {
      requireScope(current);
      pageInputSchema.parse(input);
      return page;
    }),
    update: vi.fn<PagesService["update"]>(async (current, id, expectedVersion, body) => {
      requireScope(current);
      pageIdSchema.parse(id);
      positiveInteger.parse(expectedVersion);
      pageBodySchema.parse(body);
      return { ...page, version: expectedVersion + 1, body, reason: "updated" };
    }),
    rename: vi.fn<PagesService["rename"]>(async (current, id, expectedVersion, title) => {
      requireScope(current);
      pageIdSchema.parse(id);
      positiveInteger.parse(expectedVersion);
      pageInputSchema.shape.title.parse(title);
      return { ...page, version: expectedVersion + 1, title, reason: "renamed" };
    }),
    delete: vi.fn<PagesService["delete"]>(async (current, id, expectedVersion) => {
      requireScope(current);
      pageIdSchema.parse(id);
      positiveInteger.parse(expectedVersion);
      return { deleted: true };
    }),
    versions: vi.fn<PagesService["versions"]>(async (current, id, limit) => {
      requireScope(current);
      pageIdSchema.parse(id);
      positiveInteger.parse(limit);
      return [versionMetadata];
    }),
    restore: vi.fn<PagesService["restore"]>(async (current, id, expectedVersion, version) => {
      requireScope(current);
      pageIdSchema.parse(id);
      positiveInteger.parse(expectedVersion);
      positiveInteger.parse(version);
      return { ...page, version: expectedVersion + 1, reason: "restored" };
    }),
    createShareLink: vi.fn<PagesService["createShareLink"]>(
      async (current, id, version, expires) => {
        requireScope(current);
        pageIdSchema.parse(id);
        positiveInteger.nullable().parse(version);
        z.iso.datetime().nullable().parse(expires);
        return issuedShareLink;
      },
    ),
    shareLinks: vi.fn<PagesService["shareLinks"]>(async (current, id) => {
      requireScope(current);
      pageIdSchema.parse(id);
      return [shareLink];
    }),
    revokeShareLinks: vi.fn<PagesService["revokeShareLinks"]>(async (current, id, linkId) => {
      requireScope(current);
      pageIdSchema.parse(id);
      z.string().min(1).optional().parse(linkId);
      return { revoked: 1 };
    }),
    resolveShare: vi.fn<PagesService["resolveShare"]>(async () => null),
  };
  const skills = {
    list: vi.fn<SkillsService["list"]>(async (current, availableOnly) => {
      requireScope(current);
      z.boolean().parse(availableOnly);
      return [skill];
    }),
    get: vi.fn<SkillsService["get"]>(async (current, id) => {
      requireScope(current);
      skillIdSchema.parse(id);
      return skill;
    }),
    create: vi.fn<SkillsService["create"]>(async (current, input, selected) => {
      requireScope(current);
      skillContentSchema.parse(input);
      skillAvailabilitySchema.parse(selected);
      return skill;
    }),
    update: vi.fn<SkillsService["update"]>(async (current, id, input) => {
      requireScope(current);
      skillIdSchema.parse(id);
      skillContentSchema.parse(input);
      return { ...skill, ...input };
    }),
    delete: vi.fn<SkillsService["delete"]>(async (current, id) => {
      requireScope(current);
      skillIdSchema.parse(id);
      return { deleted: true };
    }),
    setAvailability: vi.fn<SkillsService["setAvailability"]>(async (current, id, selected) => {
      requireScope(current);
      skillIdSchema.parse(id);
      return { ...skill, availability: skillAvailabilitySchema.parse(selected) };
    }),
    runCatalog: vi.fn<SkillsService["runCatalog"]>(async (current, id) => {
      requireScope(current);
      agentIdSchema.parse(id);
      return catalog;
    }),
    setAgentSkills: vi.fn<SkillsService["setAgentSkills"]>(async (current, id, ids) => {
      requireScope(current);
      agentIdSchema.parse(id);
      z.array(skillIdSchema).parse(ids);
      return catalog;
    }),
    import: vi.fn<SkillsService["import"]>(async (current, input, selected) => {
      requireScope(current);
      skillImportInputSchema.parse(input);
      skillAvailabilitySchema.parse(selected);
      return { skill, omitted: [] };
    }),
    loadForRun: vi.fn<SkillsService["loadForRun"]>(async () => skill),
    saveFromRun: vi.fn<SkillsService["saveFromRun"]>(async () => ({ id: skillId })),
  };
  const servers = {
    list: vi.fn<McpServersService["list"]>(async (owner) => {
      z.literal(accountId).parse(owner);
      return [server];
    }),
    create: vi.fn<McpServersService["create"]>(async (owner, input, headers) => {
      z.literal(accountId).parse(owner);
      mcpServerConfigurationSchema.parse(input);
      mcpCredentialHeadersSchema.parse(headers);
      return server;
    }),
    update: vi.fn<McpServersService["update"]>(async (owner, id, input, headers) => {
      z.literal(accountId).parse(owner);
      mcpServerIdSchema.parse(id);
      mcpServerConfigurationSchema.parse(input);
      mcpCredentialHeadersSchema.parse(headers);
      return server;
    }),
    delete: vi.fn<McpServersService["delete"]>(async (owner, id) => {
      z.literal(accountId).parse(owner);
      mcpServerIdSchema.parse(id);
      return { deleted: true };
    }),
    test: vi.fn<McpServersService["test"]>(async (owner, id) => {
      z.literal(accountId).parse(owner);
      mcpServerIdSchema.parse(id);
      return { code: "SUCCEEDED", toolNames: ["read_report"] };
    }),
    setAvailability: vi.fn<McpServersService["setAvailability"]>(async (owner, id, selected) => {
      z.literal(accountId).parse(owner);
      mcpServerIdSchema.parse(id);
      return { ...server, availability: skillAvailabilitySchema.parse(selected) };
    }),
    enabled: vi.fn<McpServersService["enabled"]>(async (current, id) => {
      requireScope(current);
      agentIdSchema.parse(id);
      return [serverId];
    }),
    setEnabled: vi.fn<McpServersService["setEnabled"]>(async (current, id, ids) => {
      requireScope(current);
      agentIdSchema.parse(id);
      z.array(mcpServerIdSchema).parse(ids);
      return [serverId];
    }),
  };
  const resolve = vi.fn(async (owner: string, selected: typeof spaceId) => {
    z.literal(accountId).parse(owner);
    z.literal(spaceId).parse(selected);
    return scope;
  });
  const readSession = vi.fn(async () => auth);
  const app = createApiApp({
    pages,
    skills,
    mcpServers: servers as unknown as McpServersService,
    spaces: {
      resolve,
      list: async () => [],
      create: async () => {
        throw new Error("Unused Space creation");
      },
    },
    readSession,
    allowedOrigins: ["https://web.example.test"],
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin: "https://web.example.test" },
    fetch: async (url, init) => app.fetch(new Request(url, init)),
  });
  return { client, scope, pages, skills, servers, resolve, readSession };
}
type Fixture = ReturnType<typeof fixture>;
interface ProcedureCase {
  name: string;
  request: (client: ApiClient) => Promise<unknown>;
  expected: unknown;
  verify: (fixture: Fixture) => void;
  scoped?: boolean;
}

const pageCases: ProcedureCase[] = [
  {
    name: "list",
    request: (client) => client.pages.list({ spaceId, agentId, limit: 25 }),
    expected: [pageMetadata],
    verify: (f) => expect(f.pages.list).toHaveBeenCalledWith(f.scope, { agentId, limit: 25 }),
  },
  {
    name: "get",
    request: (client) => client.pages.get({ spaceId, id: pageId, version: 1 }),
    expected: page,
    verify: (f) => expect(f.pages.get).toHaveBeenCalledWith(f.scope, pageId, 1),
  },
  {
    name: "create",
    request: (client) => client.pages.create({ spaceId, page: pageInput }),
    expected: page,
    verify: (f) => expect(f.pages.create).toHaveBeenCalledWith(f.scope, pageInput),
  },
  {
    name: "update",
    request: (client) =>
      client.pages.update({ spaceId, id: pageId, expectedVersion: 1, body: "Updated report" }),
    expected: { ...page, version: 2, body: "Updated report", reason: "updated" },
    verify: (f) =>
      expect(f.pages.update).toHaveBeenCalledWith(f.scope, pageId, 1, "Updated report"),
  },
  {
    name: "rename",
    request: (client) =>
      client.pages.rename({ spaceId, id: pageId, expectedVersion: 1, title: "December report" }),
    expected: { ...page, version: 2, title: "December report", reason: "renamed" },
    verify: (f) =>
      expect(f.pages.rename).toHaveBeenCalledWith(f.scope, pageId, 1, "December report"),
  },
  {
    name: "delete",
    request: (client) => client.pages.delete({ spaceId, id: pageId, expectedVersion: 1 }),
    expected: { deleted: true },
    verify: (f) => expect(f.pages.delete).toHaveBeenCalledWith(f.scope, pageId, 1),
  },
  {
    name: "versions",
    request: (client) => client.pages.versions({ spaceId, id: pageId, limit: 25 }),
    expected: [versionMetadata],
    verify: (f) => expect(f.pages.versions).toHaveBeenCalledWith(f.scope, pageId, 25),
  },
  {
    name: "restore",
    request: (client) =>
      client.pages.restore({ spaceId, id: pageId, expectedVersion: 2, version: 1 }),
    expected: { ...page, version: 3, reason: "restored" },
    verify: (f) => expect(f.pages.restore).toHaveBeenCalledWith(f.scope, pageId, 2, 1),
  },
  {
    name: "createShareLink",
    request: (client) =>
      client.pages.createShareLink({ spaceId, id: pageId, version: 1, expiresAt }),
    expected: issuedShareLink,
    verify: (f) =>
      expect(f.pages.createShareLink).toHaveBeenCalledWith(f.scope, pageId, 1, expiresAt),
  },
  {
    name: "shareLinks",
    request: (client) => client.pages.shareLinks({ spaceId, id: pageId }),
    expected: [shareLink],
    verify: (f) => expect(f.pages.shareLinks).toHaveBeenCalledWith(f.scope, pageId),
  },
  {
    name: "revokeShareLink",
    request: (client) =>
      client.pages.revokeShareLink({ spaceId, id: pageId, linkId: shareLink.id }),
    expected: { revoked: 1 },
    verify: (f) =>
      expect(f.pages.revokeShareLinks).toHaveBeenCalledWith(f.scope, pageId, shareLink.id),
  },
  {
    name: "revokeShareLinks",
    request: (client) => client.pages.revokeShareLinks({ spaceId, id: pageId }),
    expected: { revoked: 1 },
    verify: (f) => expect(f.pages.revokeShareLinks).toHaveBeenCalledWith(f.scope, pageId),
  },
];
const skillCases: ProcedureCase[] = [
  {
    name: "list",
    request: (client) => client.skills.list({ spaceId, availableOnly: true }),
    expected: [skill],
    verify: (f) => expect(f.skills.list).toHaveBeenCalledWith(f.scope, true),
  },
  {
    name: "get",
    request: (client) => client.skills.get({ spaceId, id: skillId }),
    expected: skill,
    verify: (f) => expect(f.skills.get).toHaveBeenCalledWith(f.scope, skillId),
  },
  {
    name: "create",
    request: (client) => client.skills.create({ spaceId, skill: skillInput, availability }),
    expected: skill,
    verify: (f) => expect(f.skills.create).toHaveBeenCalledWith(f.scope, skillInput, availability),
  },
  {
    name: "update",
    request: (client) =>
      client.skills.update({
        spaceId,
        id: skillId,
        skill: { ...skillInput, body: "Use the updated reporting process." },
      }),
    expected: { ...skill, body: "Use the updated reporting process." },
    verify: (f) =>
      expect(f.skills.update).toHaveBeenCalledWith(f.scope, skillId, {
        ...skillInput,
        body: "Use the updated reporting process.",
      }),
  },
  {
    name: "delete",
    request: (client) => client.skills.delete({ spaceId, id: skillId }),
    expected: { deleted: true },
    verify: (f) => expect(f.skills.delete).toHaveBeenCalledWith(f.scope, skillId),
  },
  {
    name: "setAvailability",
    request: (client) => client.skills.setAvailability({ spaceId, id: skillId, availability }),
    expected: skill,
    verify: (f) =>
      expect(f.skills.setAvailability).toHaveBeenCalledWith(f.scope, skillId, availability),
  },
  {
    name: "agentSkills",
    request: (client) => client.skills.agentSkills({ spaceId, agentId }),
    expected: catalog,
    verify: (f) => expect(f.skills.runCatalog).toHaveBeenCalledWith(f.scope, agentId),
  },
  {
    name: "setAgentSkills",
    request: (client) => client.skills.setAgentSkills({ spaceId, agentId, ids: [skillId] }),
    expected: catalog,
    verify: (f) =>
      expect(f.skills.setAgentSkills).toHaveBeenCalledWith(f.scope, agentId, [skillId]),
  },
  {
    name: "import",
    request: (client) => client.skills.import({ spaceId, package: skillPackage, availability }),
    expected: { skill, omitted: [] },
    verify: (f) =>
      expect(f.skills.import).toHaveBeenCalledWith(f.scope, skillPackage, availability),
  },
];
// Account-owned MCP procedures intentionally have no standalone Space selector.
// Creation/update/availability still exercise selected Space IDs; only Agent
// selection procedures resolve a request Space, just like the production contract.
const serverCases: ProcedureCase[] = [
  {
    name: "list",
    request: (client) => client.mcpServers.list({}),
    expected: [server],
    verify: (f) => expect(f.servers.list).toHaveBeenCalledWith(accountId),
  },
  {
    name: "create",
    request: (client) => client.mcpServers.create({ server: serverInput, credentialHeaders }),
    expected: server,
    verify: (f) =>
      expect(f.servers.create).toHaveBeenCalledWith(accountId, serverInput, credentialHeaders),
  },
  {
    name: "update",
    request: (client) =>
      client.mcpServers.update({ id: serverId, server: serverInput, credentialHeaders }),
    expected: server,
    verify: (f) =>
      expect(f.servers.update).toHaveBeenCalledWith(
        accountId,
        serverId,
        serverInput,
        credentialHeaders,
      ),
  },
  {
    name: "delete",
    request: (client) => client.mcpServers.delete({ id: serverId }),
    expected: { deleted: true },
    verify: (f) => expect(f.servers.delete).toHaveBeenCalledWith(accountId, serverId),
  },
  {
    name: "test",
    request: (client) => client.mcpServers.test({ id: serverId }),
    expected: { code: "SUCCEEDED", toolNames: ["read_report"] },
    verify: (f) => expect(f.servers.test).toHaveBeenCalledWith(accountId, serverId),
  },
  {
    name: "setAvailability",
    request: (client) => client.mcpServers.setAvailability({ id: serverId, availability }),
    expected: server,
    verify: (f) =>
      expect(f.servers.setAvailability).toHaveBeenCalledWith(accountId, serverId, availability),
  },
  {
    name: "enabled",
    request: (client) => client.mcpServers.enabled({ spaceId, agentId }),
    expected: [serverId],
    verify: (f) => expect(f.servers.enabled).toHaveBeenCalledWith(f.scope, agentId),
    scoped: true,
  },
  {
    name: "setEnabled",
    request: (client) => client.mcpServers.setEnabled({ spaceId, agentId, serverIds: [serverId] }),
    expected: [serverId],
    verify: (f) => expect(f.servers.setEnabled).toHaveBeenCalledWith(f.scope, agentId, [serverId]),
    scoped: true,
  },
];

describe("phase-five RPC input/handler contracts", () => {
  it.each(pageCases)("pages.$name", async ({ request, expected, verify }) => {
    const f = fixture();
    expect(await request(f.client)).toEqual(expected);
    verify(f);
    expect(f.resolve).toHaveBeenCalledExactlyOnceWith(accountId, spaceId);
    expect(f.readSession).toHaveBeenCalledOnce();
  });
  it.each(skillCases)("skills.$name", async ({ request, expected, verify }) => {
    const f = fixture();
    expect(await request(f.client)).toEqual(expected);
    verify(f);
    expect(f.resolve).toHaveBeenCalledExactlyOnceWith(accountId, spaceId);
    expect(f.readSession).toHaveBeenCalledOnce();
  });
  it.each(serverCases)("mcpServers.$name", async ({ request, expected, verify, scoped }) => {
    const f = fixture();
    const result = await request(f.client);
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toContain(credentialHeaders.authorization);
    verify(f);
    expect(f.resolve.mock.calls).toEqual(scoped ? [[accountId, spaceId]] : []);
    expect(f.readSession).toHaveBeenCalledOnce();
  });
});
