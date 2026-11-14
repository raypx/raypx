import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ConversationRunner } from "@raypx/agents/server";
import {
  createAgentsRepository,
  createConversationsRepository,
  cancelSpaceRuns,
} from "@raypx/agents/server/postgres";
import { createApiClient } from "@raypx/client/api";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  conversationRunCheckpoints,
  conversationRuns,
  modelConnections,
  modelConnectionSecrets,
  modelConnectionSpaces,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import type { ModelConnectionConfiguration } from "@raypx/core/model-connections";
import { createSpaceAccess, createSpaceManagement } from "@raypx/spaces/server/postgres";
import { createModelConnectionsRepository } from "../../../src/conversations/connections-postgres.js";
import {
  connectionModelId,
  createModelConnections,
  type ConnectionTransport,
} from "../../../src/conversations/connections.js";
import type { ConversationModels } from "../../../src/conversations/models.js";
import {
  applicationSecretKeyProvider,
  createPostgresSecretStore,
} from "../../../src/conversations/secrets.js";
import { createApiLogging } from "../../../src/logging.js";
import { createApiApp } from "../../helpers/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const repository = createModelConnectionsRepository(connection.db);
const secrets = createPostgresSecretStore(
  connection.db,
  applicationSecretKeyProvider("model-connections-fixture-application-key-32-characters"),
);
const accounts: string[] = [];
const ownedSpaces: string[] = [];
const cleanup: Array<() => Promise<void>> = [];
const secret = "private-model-connection-credential-fixture";
const replacementSecret = "rotated-private-model-connection-credential-fixture";
const configuration: ModelConnectionConfiguration = {
  name: "My models",
  kind: "compatible",
  baseUrl: "https://model.example.test/v1",
  api: "openai-completions",
  models: ["chat-main", "chat-fast"],
  availability: { mode: "all" },
};
beforeAll(async () => {
  await migrateDatabase(url);
});
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
afterAll(async () => {
  try {
    if (ownedSpaces.length)
      await connection.db.delete(spaces).where(inArray(spaces.id, ownedSpaces));
    if (accounts.length) await connection.db.delete(user).where(inArray(user.id, accounts));
  } finally {
    await connection.close();
  }
});

async function fixture() {
  const owner = `model-owner-${crypto.randomUUID()}`;
  const member = `model-member-${crypto.randomUUID()}`;
  accounts.push(owner, member);
  await connection.db.insert(user).values(
    [owner, member].map((id) => ({
      id,
      name: "Connection fixture",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const shared = (await access.create(owner, { name: "Shared models" })).space;
  const other = (await access.create(owner, { name: "Other models" })).space;
  const memberOnly = (await access.create(member, { name: "Member models" })).space;
  ownedSpaces.push(shared.id, other.id, memberOnly.id);
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: shared.id, accountId: member, role: "member" });
  const scope = await access.resolve(owner, shared.id);
  const memberScope = await access.resolve(member, shared.id);
  const otherScope = await access.resolve(owner, other.id);
  const transport: ConnectionTransport = {
    validate: vi.fn(),
    resolve: vi.fn<ConnectionTransport["resolve"]>(async () => ({
      stream() {
        throw new Error("Unexpected model call");
      },
    })),
    test: vi.fn<ConnectionTransport["test"]>(async () => "SUCCEEDED"),
    close: vi.fn(),
  };
  const service = createModelConnections(repository, secrets, transport);
  const deployment: ConversationModels = {
    async list() {
      return [{ modelId: "deployment-main", name: "Deployment model", source: "deployment" }];
    },
    async resolve() {
      throw new Error("Unexpected deployment model");
    },
    close() {},
  };
  const models = service.models(deployment);
  const logs: unknown[] = [];
  const logging = createApiLogging({
    environment: "test",
    sink: ({ event }) => {
      logs.push(event);
    },
  });
  cleanup.push(() => logging.close());
  function client(accountId: string) {
    const app = createApiApp({
      modelConnections: service,
      conversationModels: models,
      spaces: access,
      logger: logging,
      allowedOrigins: ["https://web.example.test"],
      readSession: async () => ({
        user: {
          id: accountId,
          name: "Connection fixture",
          email: `${accountId}@example.test`,
          emailVerified: true,
          role: "admin",
        },
        session: {
          id: `session-${accountId}`,
          userId: accountId,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    });
    return createApiClient({
      baseUrl: "https://api.example.test",
      headers: { origin: "https://web.example.test" },
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    });
  }
  return {
    owner,
    member,
    shared,
    other,
    memberOnly,
    scope,
    memberScope,
    otherScope,
    transport,
    service,
    models,
    logs,
    logging,
    ownerClient: client(owner),
    memberClient: client(member),
  };
}
function assertNoSecrets(...values: unknown[]) {
  const serialized = JSON.stringify(values);
  expect(serialized).not.toContain(secret);
  expect(serialized).not.toContain(replacementSecret);
}
async function storedSecrets(accountId: string) {
  return connection.db
    .select()
    .from(modelConnectionSecrets)
    .where(eq(modelConnectionSecrets.accountId, accountId))
    .orderBy(asc(modelConnectionSecrets.id));
}
async function storedSelections(accountId: string) {
  return connection.db
    .select()
    .from(modelConnectionSpaces)
    .where(eq(modelConnectionSpaces.accountId, accountId))
    .orderBy(asc(modelConnectionSpaces.connectionId), asc(modelConnectionSpaces.spaceId));
}

it("encrypts write-only credentials and preserves or replaces them through owner-only CRUD", async () => {
  const f = await fixture();
  const created = await f.ownerClient.modelConnections.create({
    connection: configuration,
    secret,
  });
  expect(created).not.toHaveProperty("secretId");
  const [encrypted] = await storedSecrets(f.owner);
  expect(encrypted).toMatchObject({
    connectionId: created.id,
    accountId: f.owner,
    keyId: "application-v1",
  });
  assertNoSecrets(encrypted, created);
  expect(await secrets.read(f.owner, created.id, encrypted!.id)).toBe(secret);
  await expect(secrets.read(f.member, created.id, encrypted!.id)).rejects.toThrow(
    "SECRET_UNAVAILABLE",
  );
  expect(await f.memberClient.modelConnections.list({})).toEqual([]);
  for (const operation of [
    () =>
      f.memberClient.modelConnections.update({
        id: created.id,
        connection: configuration,
        secret: replacementSecret,
      }),
    () => f.memberClient.modelConnections.delete({ id: created.id }),
    () => f.memberClient.modelConnections.test({ id: created.id }),
  ])
    await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
  const updated = await f.ownerClient.modelConnections.update({
    id: created.id,
    connection: { ...configuration, name: "Renamed" },
  });
  expect((await storedSecrets(f.owner))[0]).toEqual(encrypted);
  expect(updated.name).toBe("Renamed");
  const rotated = await f.ownerClient.modelConnections.update({
    id: created.id,
    connection: configuration,
    secret: replacementSecret,
  });
  const [replacement] = await storedSecrets(f.owner);
  expect(replacement!.id).toBe(encrypted!.id);
  expect(replacement!.ciphertext).not.toBe(encrypted!.ciphertext);
  expect(replacement!.wrappedDataKey).not.toBe(encrypted!.wrappedDataKey);
  expect(await secrets.read(f.owner, created.id, replacement!.id)).toBe(replacementSecret);
  expect(await f.ownerClient.modelConnections.test({ id: created.id })).toEqual({
    code: "SUCCEEDED",
  });
  expect(f.transport.test).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: created.id }),
    "chat-main",
    replacementSecret,
  );
  vi.mocked(f.transport.test).mockRejectedValueOnce(new Error(secret));
  const failedTest = await f.ownerClient.modelConnections.test({ id: created.id });
  expect(failedTest).toEqual({ code: "REQUEST_FAILED" });
  expect(await f.ownerClient.modelConnections.test({ id: created.id, model: "unoffered" })).toEqual(
    { code: "MODEL_UNAVAILABLE" },
  );
  const publicList = await f.ownerClient.modelConnections.list({});
  expect(publicList.map((row) => row.id)).toEqual([created.id]);
  const deleted = await f.ownerClient.modelConnections.delete({ id: created.id });
  expect(deleted).toEqual({ deleted: true });
  expect(await storedSecrets(f.owner)).toEqual([]);
  expect(await f.ownerClient.modelConnections.list({})).toEqual([]);
  await f.logging.flush();
  assertNoSecrets(created, updated, rotated, publicList, deleted, replacement, failedTest, f.logs);
});

it("keeps all and selected availability within one owner's memberships, including later Spaces", async () => {
  const f = await fixture();
  const all = await f.service.create(f.owner, configuration, secret);
  const selected = await f.service.create(
    f.owner,
    {
      ...configuration,
      name: "Selected",
      availability: { mode: "selected", spaceIds: [f.shared.id] },
    },
    replacementSecret,
  );
  const ownIds = (await f.models.list(f.scope))
    .filter((model) => model.source === "connection")
    .map((model) => model.modelId);
  expect(ownIds).toEqual(
    expect.arrayContaining([
      connectionModelId(all.id, "chat-main"),
      connectionModelId(selected.id, "chat-main"),
    ]),
  );
  const otherIds = (await f.models.list(f.otherScope)).map((model) => model.modelId);
  expect(otherIds).toContain(connectionModelId(all.id, "chat-main"));
  expect(otherIds).not.toContain(connectionModelId(selected.id, "chat-main"));
  expect(await f.models.list(f.memberScope)).toEqual([
    { modelId: "deployment-main", name: "Deployment model", source: "deployment" },
  ]);
  const later = (await access.create(f.owner, { name: "Later models" })).space;
  ownedSpaces.push(later.id);
  expect(
    (await f.models.list(await access.resolve(f.owner, later.id))).map((model) => model.modelId),
  ).toContain(connectionModelId(all.id, "chat-main"));
  const memberConnection = await f.service.create(f.member, configuration, secret);
  const memberModels = await f.memberClient.agents.models({ spaceId: f.shared.id });
  expect(memberModels.map((model) => model.modelId)).toContain(
    connectionModelId(memberConnection.id, "chat-main"),
  );
  expect(memberModels.map((model) => model.modelId)).not.toContain(
    connectionModelId(all.id, "chat-main"),
  );
  const offered = await f.ownerClient.agents.models({ spaceId: f.shared.id });
  for (const model of offered) {
    expect(model).not.toHaveProperty("baseUrl");
    expect(model).not.toHaveProperty("secretId");
  }
  await f.logging.flush();
  assertNoSecrets(offered, memberModels, f.logs);
});

it("rolls back every connection table when a selected Space belongs only to another member", async () => {
  const f = await fixture();
  await expect(
    f.service.create(
      f.owner,
      { ...configuration, availability: { mode: "selected", spaceIds: [f.memberOnly.id] } },
      secret,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await repository.list(f.owner)).toEqual([]);
  expect(await storedSecrets(f.owner)).toEqual([]);
  expect(await storedSelections(f.owner)).toEqual([]);
  const saved = await f.service.create(
    f.owner,
    { ...configuration, availability: { mode: "selected", spaceIds: [f.shared.id] } },
    secret,
  );
  const beforeSecret = await storedSecrets(f.owner);
  await expect(
    f.service.update(
      f.owner,
      saved.id,
      { ...configuration, availability: { mode: "selected", spaceIds: [f.memberOnly.id] } },
      replacementSecret,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await storedSecrets(f.owner)).toEqual(beforeSecret);
  expect((await repository.get(f.owner, saved.id)).availability).toEqual({
    mode: "selected",
    spaceIds: [f.shared.id],
  });
});

it("removes availability bindings on member and Space deletion without deleting the owned connection or credential", async () => {
  const f = await fixture();
  const saved = await f.service.create(
    f.owner,
    { ...configuration, availability: { mode: "selected", spaceIds: [f.shared.id, f.other.id] } },
    secret,
  );
  expect(await storedSelections(f.owner)).toHaveLength(2);
  await connection.db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, f.shared.id), eq(spaceMembers.accountId, f.owner)));
  expect((await repository.get(f.owner, saved.id)).availability).toEqual({
    mode: "selected",
    spaceIds: [f.other.id],
  });
  expect(await storedSecrets(f.owner)).toHaveLength(1);
  expect(await repository.list(f.owner, f.shared.id)).toEqual([]);
  await connection.db.delete(spaces).where(eq(spaces.id, f.other.id));
  expect(await storedSelections(f.owner)).toEqual([]);
  expect((await repository.get(f.owner, saved.id)).availability).toEqual({
    mode: "selected",
    spaceIds: [],
  });
  expect(await storedSecrets(f.owner)).toHaveLength(1);
});

it("cascades direct connection and account deletion through every new table", async () => {
  const f = await fixture();
  const saved = await f.service.create(
    f.owner,
    { ...configuration, availability: { mode: "selected", spaceIds: [f.shared.id] } },
    secret,
  );
  await connection.db.delete(modelConnections).where(eq(modelConnections.id, saved.id));
  expect(await repository.list(f.owner)).toEqual([]);
  expect(await storedSecrets(f.owner)).toEqual([]);
  expect(await storedSelections(f.owner)).toEqual([]);
  await f.service.create(
    f.owner,
    { ...configuration, availability: { mode: "selected", spaceIds: [f.shared.id] } },
    secret,
  );
  await connection.db.delete(user).where(eq(user.id, f.owner));
  expect(await repository.list(f.owner)).toEqual([]);
  expect(await storedSecrets(f.owner)).toEqual([]);
  expect(await storedSelections(f.owner)).toEqual([]);
  expect(await access.resolve(f.member, f.shared.id)).toMatchObject({
    member: { accountId: f.member },
  });
});

it("revokes a removed member's selected and all-Space models while retaining their Run history", async () => {
  const f = await fixture();
  const selected = await f.service.create(
    f.member,
    {
      ...configuration,
      availability: { mode: "selected", spaceIds: [f.shared.id] },
    },
    secret,
  );
  const all = await f.service.create(f.member, configuration, replacementSecret);
  const conversations = createConversationsRepository(connection.db);
  const { conversation } = await createAgentsRepository(connection.db).create(f.scope, {
    name: "Shared history",
    instructions: "",
    model: { modelId: connectionModelId(selected.id, "chat-main") },
  });
  await conversations.send(f.memberScope, conversation.id, {
    text: "Keep my history",
    idempotencyKey: "member-history",
  });
  const claimed = (await conversations.claimNext(f.memberScope, conversation.id, {
    ownerId: "removed-member",
    leaseMs: 15000,
    timeoutMs: 300000,
    backupMarginMs: 30000,
  }))!;
  const pinned = await f.models.resolve(claimed.run);
  await conversations.pinResources(f.memberScope, claimed.run, {
    connectionId: pinned.connectionId!,
  });
  await createSpaceManagement(connection.db, { beforeMemberRemoved: cancelSpaceRuns }).removeMember(
    f.scope,
    f.member,
  );
  await expect(access.resolve(f.member, f.shared.id)).rejects.toThrow("not found");
  expect(await repository.list(f.member, f.shared.id)).toEqual([]);
  expect(await storedSelections(f.member)).toEqual([]);
  expect((await repository.list(f.member)).map((row) => row.id)).toEqual(
    expect.arrayContaining([selected.id, all.id]),
  );
  const removedActorRun = { ...claimed.run, connectionId: pinned.connectionId! };
  await expect(f.models.resolve(removedActorRun)).rejects.toMatchObject({
    code: "CONNECTION_UNAVAILABLE",
  });
  const history = await conversations.snapshot(f.scope, conversation.id);
  expect(history.messages).toContainEqual(expect.objectContaining({ text: "Keep my history" }));
  expect(history.runs).toContainEqual(
    expect.objectContaining({ id: claimed.run.id, state: "cancelled" }),
  );
  await expect(
    f.service.update(f.member, selected.id, {
      ...configuration,
      availability: { mode: "selected", spaceIds: [f.shared.id] },
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("resumes a pinned durable Run after credential rotation and fails explicitly after connection deletion", async () => {
  const f = await fixture();
  const saved = await f.service.create(f.owner, configuration, secret);
  const agents = createAgentsRepository(connection.db);
  const conversations = createConversationsRepository(connection.db);
  const { conversation } = await agents.create(f.scope, {
    name: "Connection Run",
    instructions: "",
    model: { modelId: connectionModelId(saved.id, "chat-main") },
  });
  const message = { text: "Run with my model", idempotencyKey: "connection-resume" };
  await conversations.send(f.scope, conversation.id, message);
  const claim = {
    ownerId: "model-original",
    leaseMs: 15000,
    timeoutMs: 300000,
    backupMarginMs: 30000,
  };
  const original = (await conversations.claimNext(f.scope, conversation.id, claim))!;
  const resolved = await f.models.resolve(original.run);
  expect(resolved.connectionId).toMatch(new RegExp(`^connection:${saved.id}:`));
  await conversations.pinResources(f.scope, original.run, { connectionId: resolved.connectionId! });
  await conversations.saveCheckpoint(f.scope, original.run, {
    continuation: [],
    pendingCalls: [],
    rounds: 0,
    completed: false,
  });
  await conversations.release(f.scope, original.run);
  await f.service.update(f.owner, saved.id, configuration, replacementSecret);
  const resumed = (await conversations.claimNext(f.scope, conversation.id, {
    ...claim,
    ownerId: "model-resumed",
  }))!;
  expect(resumed.run.connectionId).toBe(resolved.connectionId);
  expect((await f.models.resolve(resumed.run)).connectionId).toBe(resolved.connectionId);
  expect(f.transport.resolve).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: saved.id }),
    "chat-main",
    replacementSecret,
  );
  const secondMemberRun = { ...resumed.run, memberAccountId: f.member };
  await expect(f.models.resolve(secondMemberRun)).rejects.toMatchObject({
    code: "CONNECTION_UNAVAILABLE",
  });
  await conversations.release(f.scope, resumed.run);
  await f.service.delete(f.owner, saved.id);
  await expect(f.models.resolve(resumed.run)).rejects.toMatchObject({
    code: "CONNECTION_UNAVAILABLE",
  });
  const runner = new ConversationRunner(
    conversations,
    f.models,
    (code) => {
      f.logs.push({ code });
    },
    (operation, runId, durationMs) => {
      f.logs.push({ operation, runId, durationMs });
    },
  );
  cleanup.push(() => runner.close());
  await runner.conversations.send(f.scope, conversation.id, message);
  await expect
    .poll(async () => (await conversations.snapshot(f.scope, conversation.id)).runs[0])
    .toMatchObject({ state: "failed", failureCode: "CONNECTION_UNAVAILABLE" });
  const snapshot = await conversations.snapshot(f.scope, conversation.id);
  const events = await conversations.events(f.scope, conversation.id, 0, 100);
  const checkpoints = await connection.db
    .select()
    .from(conversationRunCheckpoints)
    .where(
      and(
        eq(conversationRunCheckpoints.spaceId, f.scope.spaceId),
        eq(conversationRunCheckpoints.conversationId, conversation.id),
      ),
    )
    .orderBy(asc(conversationRunCheckpoints.runId));
  const storedRuns = await connection.db
    .select()
    .from(conversationRuns)
    .where(
      and(
        eq(conversationRuns.spaceId, f.scope.spaceId),
        eq(conversationRuns.conversationId, conversation.id),
      ),
    )
    .orderBy(asc(conversationRuns.messageSequence), asc(conversationRuns.id));
  await f.logging.flush();
  assertNoSecrets(snapshot, events, checkpoints, storedRuns, f.logs);
});
