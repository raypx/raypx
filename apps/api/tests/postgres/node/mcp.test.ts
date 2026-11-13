import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  agentMcpServers,
  agents,
  mcpServers,
  mcpServerSecrets,
  mcpServerSpaces,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import { agentIdSchema } from "@raypx/core/agents";
import type { McpServerConfiguration } from "@raypx/core/mcp-servers";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createMcpServersRepository } from "../../../src/conversations/mcp-postgres.js";
import { createMcpServers } from "../../../src/conversations/mcp-servers.js";
import { applicationSecretKeyProvider } from "../../../src/conversations/secrets.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const db = connection.db;
const access = createSpaceAccess(db);
const repository = createMcpServersRepository(db);
const service = createMcpServers(
  repository,
  applicationSecretKeyProvider("phase5-mcp-isolated-test-wrapping-key"),
  {
    validate() {},
    async listTools() {
      return [
        { name: "read", description: "Read", inputSchema: { type: "object" }, readOnly: true },
      ];
    },
    async callTool() {
      return { content: "fake data", isError: false, truncated: false };
    },
  },
);
const configuration: McpServerConfiguration = {
  name: "Reports",
  transport: "http",
  url: "https://tools.example.test/mcp",
  availability: { mode: "all" },
};
const accountIds: string[] = [];
const spaceIds: string[] = [];
beforeAll(() => migrateDatabase(url));
afterEach(async () => {
  if (spaceIds.length) await db.delete(spaces).where(inArray(spaces.id, spaceIds.splice(0)));
  if (accountIds.length) await db.delete(user).where(inArray(user.id, accountIds.splice(0)));
});
afterAll(() => connection.close());
async function fixture() {
  const owner = `mcp-owner-${crypto.randomUUID()}`;
  const member = `mcp-member-${crypto.randomUUID()}`;
  accountIds.push(owner, member);
  await db.insert(user).values(
    [owner, member].map((id) => ({
      id,
      name: "MCP fixture",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const a = (await access.create(owner, { name: "MCP A" })).space;
  const b = (await access.create(owner, { name: "MCP B" })).space;
  spaceIds.push(a.id, b.id);
  await db.insert(spaceMembers).values({ spaceId: a.id, accountId: member, role: "member" });
  const agentId = agentIdSchema.parse(`agent-${crypto.randomUUID()}`);
  await db
    .insert(agents)
    .values({ spaceId: a.id, id: agentId, name: "Reports", instructions: "", modelId: "fake" });
  const server = await service.create(
    owner,
    { ...configuration, availability: { mode: "selected", spaceIds: [a.id] } },
    { Authorization: "Bearer private-mcp-secret" },
  );
  const scope = await access.resolve(owner, a.id);
  await service.setEnabled(scope, agentId, [server.id]);
  return { owner, member, a, b, agentId, server, scope };
}
it("owns metadata and selections per account and includes future Spaces for all availability", async () => {
  const f = await fixture();
  expect(await service.list(f.member)).toEqual([]);
  await expect(service.test(f.member, f.server.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    service.setEnabled(await access.resolve(f.member, f.a.id), f.agentId, [f.server.id]),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await repository.list(f.owner, f.b.id)).toEqual([]);
  await service.setAvailability(f.owner, f.server.id, { mode: "all" });
  const future = (await access.create(f.owner, { name: "Future MCP" })).space;
  spaceIds.push(future.id);
  expect(await repository.list(f.owner, future.id)).toHaveLength(1);
  const [secret] = await db
    .select()
    .from(mcpServerSecrets)
    .where(eq(mcpServerSecrets.accountId, f.owner))
    .limit(1);
  expect(JSON.stringify(secret)).not.toContain("private-mcp-secret");
});
it("rejects cross-Space Agent references and cross-owner availability/secret references", async () => {
  const f = await fixture();
  await expect(
    db
      .insert(agentMcpServers)
      .values({ spaceId: f.b.id, agentId: f.agentId, accountId: f.owner, serverId: f.server.id }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    db
      .insert(agentMcpServers)
      .values({ spaceId: f.a.id, agentId: f.agentId, accountId: f.member, serverId: f.server.id }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    db
      .insert(mcpServerSpaces)
      .values({ spaceId: f.b.id, accountId: f.member, serverId: f.server.id }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    db.insert(mcpServerSecrets).values({
      id: crypto.randomUUID(),
      serverId: f.server.id,
      accountId: f.member,
      ciphertext: "fake",
      keyId: "fake",
      wrappedDataKey: "fake",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});
it.each(["space", "membership", "account"] as const)(
  "deletes %s with every MCP table populated",
  async (target) => {
    const f = await fixture();
    if (target === "space") await db.delete(spaces).where(eq(spaces.id, f.a.id));
    if (target === "membership")
      await db
        .delete(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, f.a.id), eq(spaceMembers.accountId, f.owner)));
    if (target === "account") await db.delete(user).where(eq(user.id, f.owner));
    expect(
      await db.select().from(agentMcpServers).where(eq(agentMcpServers.spaceId, f.a.id)),
    ).toEqual([]);
    expect(
      await db.select().from(mcpServerSpaces).where(eq(mcpServerSpaces.spaceId, f.a.id)),
    ).toEqual([]);
    const expectedOwnedRows = target === "account" ? 0 : 1;
    expect(
      await db.select().from(mcpServers).where(eq(mcpServers.accountId, f.owner)),
    ).toHaveLength(expectedOwnedRows);
    expect(
      await db.select().from(mcpServerSecrets).where(eq(mcpServerSecrets.accountId, f.owner)),
    ).toHaveLength(expectedOwnedRows);
  },
);
