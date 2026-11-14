import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  agents,
  openApiServers,
  openApiServerAgents,
  openApiServerSecrets,
  conversationEvents,
  conversationEffects,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import {
  createAgentsRepository,
  createApprovalsRepository,
  createConversationsRepository,
} from "@raypx/agents/server/postgres";
import {
  ComputerToolsError,
  createApprovalsService,
  type ComputerTools,
} from "@raypx/agents/server";
import { toolNameSchema } from "@raypx/core/approvals";
import type { OpenApiServerConfiguration } from "@raypx/core/openapi-servers";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createOpenApiServersRepository } from "../../../src/conversations/openapi-postgres.js";
import { createOpenApiServers } from "../../../src/conversations/openapi-servers.js";
import { openApiToolName, withOpenApiTools } from "../../../src/conversations/openapi-tools.js";
import { applicationSecretKeyProvider } from "../../../src/conversations/secrets.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const db = connection.db;
const access = createSpaceAccess(db);
const repository = createOpenApiServersRepository(db);
const execute = vi.fn(async () => ({
  status: 200,
  content: "outside data",
  truncated: false,
  isError: false,
}));
const service = createOpenApiServers(
  repository,
  applicationSecretKeyProvider("openapi-isolated-postgres-wrapping-key"),
  {
    validate() {},
    async fetchDocument() {
      return document;
    },
    async test() {},
    call: execute,
  },
);
const document = JSON.stringify({
  openapi: "3.1.0",
  paths: {
    "/items": {
      get: { operationId: "read", summary: "Read items" },
      post: { operationId: "create", summary: "Create item" },
    },
  },
});
const configuration: OpenApiServerConfiguration = {
  name: "Reports",
  url: "https://api.example.test",
  selectedOperationIds: ["read", "create"],
  availability: { mode: "all" },
};
const accountIds: string[] = [];
const spaceIds: string[] = [];
beforeAll(() => migrateDatabase(url));
afterEach(async () => {
  execute.mockClear();
  if (spaceIds.length) await db.delete(spaces).where(inArray(spaces.id, spaceIds.splice(0)));
  if (accountIds.length) await db.delete(user).where(inArray(user.id, accountIds.splice(0)));
});
afterAll(() => connection.close());
async function fixture() {
  const owner = `openapi-owner-${crypto.randomUUID()}`,
    member = `openapi-member-${crypto.randomUUID()}`;
  accountIds.push(owner, member);
  await db.insert(user).values(
    [owner, member].map((id) => ({
      id,
      name: "API fixture",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const a = (await access.create(owner, { name: "API A" })).space,
    b = (await access.create(owner, { name: "API B" })).space;
  spaceIds.push(a.id, b.id);
  await db.insert(spaceMembers).values({ spaceId: a.id, accountId: member, role: "member" });
  const scope = await access.resolve(owner, a.id),
    other = await access.resolve(member, a.id),
    foreign = await access.resolve(owner, b.id);
  const saved = await createAgentsRepository(db).create(scope, {
    name: "Reports",
    instructions: "",
    model: { modelId: "fixture" },
  });
  const server = await service.create(
    scope,
    { ...configuration, availability: { mode: "selected", agentIds: [saved.agent.id] } },
    { document },
    { type: "bearer", value: "private-openapi-credential" },
  );
  return { owner, member, a, b, scope, other, foreign, server, ...saved };
}
it("isolates APIs and secrets by Space, grants selected Agents to current members and keeps credential ciphertext private", async () => {
  const f = await fixture();
  expect(await service.list(f.foreign)).toEqual([]);
  await expect(service.test(f.foreign, f.server.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    repository.readSecret(
      f.foreign,
      f.server.id,
      (await repository.get(f.scope, f.server.id)).secretId,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(service.delete(f.other, f.server.id)).rejects.toMatchObject({
    code: "OWNER_REQUIRED",
  });
  expect(
    await service.catalog(f.other, f.agent.id, "run", new AbortController().signal),
  ).toHaveLength(1);
  const [encrypted] = await db
    .select()
    .from(openApiServerSecrets)
    .where(eq(openApiServerSecrets.spaceId, f.a.id));
  expect(JSON.stringify([encrypted, f.server, await service.list(f.other)])).not.toContain(
    "private-openapi-credential",
  );
  await db
    .update(spaceMembers)
    .set({ removedAt: new Date() })
    .where(and(eq(spaceMembers.spaceId, f.a.id), eq(spaceMembers.accountId, f.member)));
  await expect(
    service.catalog(f.other, f.agent.id, "run", new AbortController().signal),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("enforces same-Space server/Agent and encrypted-secret composite foreign keys and cascades on deletion", async () => {
  const f = await fixture();
  const foreignAgent = await createAgentsRepository(db).create(f.foreign, {
    name: "Foreign",
    instructions: "",
    model: { modelId: "fixture" },
  });
  await expect(
    db
      .insert(openApiServerAgents)
      .values({ spaceId: f.a.id, serverId: f.server.id, agentId: foreignAgent.agent.id }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    db.insert(openApiServerSecrets).values({
      spaceId: f.b.id,
      serverId: f.server.id,
      id: crypto.randomUUID(),
      ciphertext: "fake",
      keyId: "fake",
      wrappedDataKey: "fake",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    service.update(f.scope, f.server.id, {
      ...configuration,
      availability: { mode: "selected", agentIds: [foreignAgent.agent.id] },
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await db.select().from(agents).where(eq(agents.spaceId, f.a.id))).toHaveLength(1);
  await service.delete(f.scope, f.server.id);
  expect(
    await db.select().from(openApiServerSecrets).where(eq(openApiServerSecrets.spaceId, f.a.id)),
  ).toEqual([]);
  expect(
    await db.select().from(openApiServerAgents).where(eq(openApiServerAgents.spaceId, f.a.id)),
  ).toEqual([]);
});
it("rechecks owner role in the write transaction after document fetching", async () => {
  const f = await fixture();
  await db
    .update(spaceMembers)
    .set({ role: "member" })
    .where(and(eq(spaceMembers.spaceId, f.a.id), eq(spaceMembers.accountId, f.owner)));
  await expect(service.create(f.scope, configuration, { document })).rejects.toMatchObject({
    code: "OWNER_REQUIRED",
  });
  await expect(service.update(f.scope, f.server.id, configuration)).rejects.toMatchObject({
    code: "OWNER_REQUIRED",
  });
  await expect(service.delete(f.scope, f.server.id)).rejects.toMatchObject({
    code: "OWNER_REQUIRED",
  });
  expect(
    await db.select().from(openApiServers).where(eq(openApiServers.spaceId, f.a.id)),
  ).toHaveLength(1);
});
it("runs read/mutation through approvals, durable effects and readable lifecycle without credentials, and reuses completed outcomes", async () => {
  const f = await fixture();
  const conversations = createConversationsRepository(db);
  const approvals = createApprovalsService(createApprovalsRepository(db));
  await conversations.send(f.other, f.conversation.id, {
    text: "Read then create",
    idempotencyKey: crypto.randomUUID(),
  });
  const run = (await conversations.claimNext(f.other, f.conversation.id, {
    ownerId: "openapi-postgres",
    leaseMs: 60000,
    timeoutMs: 300000,
    backupMarginMs: 30000,
  }))!.run;
  const base: ComputerTools = {
    definitions: () => [],
    prepare() {
      throw new ComputerToolsError("INVALID_TOOL");
    },
    async execute() {
      throw new Error("Unexpected builtin");
    },
    async cancel() {},
    release() {},
  };
  const tools = withOpenApiTools(base, service);
  const signal = new AbortController().signal;
  await tools.initialize?.(f.other, run, signal);
  const cards = [];
  for (const operationId of ["read", "create"]) {
    const call = tools.prepare(
      {
        type: "toolCall",
        id: operationId,
        name: openApiToolName(f.server.id, operationId),
        arguments: {},
      },
      run,
    );
    await conversations.beginTool(f.other, run, {
      toolCallId: call.id,
      toolName: call.name,
      target: call.target,
      argumentSummary: call.argumentSummary,
    });
    const pending = approvals.authorize(f.other, run, call, signal);
    if (operationId === "create") {
      const request = await vi.waitFor(
        async () => {
          const [pendingRequest] = await approvals.listPending(f.other);
          if (!pendingRequest) throw new Error("Approval not yet created");
          return pendingRequest;
        },
        { timeout: 3000, interval: 20 },
      );
      cards.push(request);
      await approvals.answer(f.other, request.id, { decision: "approved" });
    }
    expect(await pending).toBe("approved");
    const operation = () => tools.execute(f.other, run, call, signal);
    expect(
      JSON.parse(await approvals.executeEffect(f.other, run, call, operation, signal)),
    ).toMatchObject({ state: "succeeded", untrusted: true });
    await approvals.executeEffect(f.other, run, call, operation, signal);
  }
  expect(cards).toMatchObject([
    {
      target: "POST https://api.example.test/items",
      argumentSummary: "POST Create item",
      memberAccountId: f.member,
    },
  ]);
  expect(execute).toHaveBeenCalledTimes(2);
  const effects = await approvals.listEffects(f.other, run.id);
  expect(effects).toHaveLength(2);
  expect(effects.every((effect) => effect.state === "succeeded")).toBe(true);
  const events = await db
    .select()
    .from(conversationEvents)
    .where(eq(conversationEvents.spaceId, f.a.id));
  const storedEffects = await db
    .select()
    .from(conversationEffects)
    .where(eq(conversationEffects.spaceId, f.a.id));
  expect(JSON.stringify([events, effects, storedEffects, tools.snapshot?.(run)])).not.toContain(
    "private-openapi-credential",
  );
  const readName = toolNameSchema.parse(openApiToolName(f.server.id, "read"));
  const settings = await approvals.getSettings(f.member);
  await approvals.updateSettings(f.member, {
    expectedRevision: settings.revision,
    mode: "never",
    rules: [{ toolName: readName, executable: null, decision: "block" }],
  });
  const blocked = tools.prepare(
    { type: "toolCall", id: "blocked", name: readName, arguments: {} },
    run,
  );
  expect(await approvals.authorize(f.other, run, blocked, signal)).toBe("blocked");
  await conversations.stop(f.other, f.conversation.id, run.id);
  tools.release(run);
});
