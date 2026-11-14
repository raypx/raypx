import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { conversations, user, spaces } from "@raypx/database/schema";
import { eq, sql } from "drizzle-orm";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { agentIdSchema, type AgentInput } from "@raypx/core/agents";
import { createAgentsRepository } from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("An isolated *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const repository = createAgentsRepository(connection.db);
const accountId = `agents-${crypto.randomUUID()}`;
const owned: string[] = [];
const input: AgentInput = {
  name: "Helper",
  instructions: "Keep the instructions",
  model: { modelId: "model" },
};
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values({ id: accountId, name: "Agent fixture", email: `${accountId}@example.test` });
});
afterAll(async () => {
  try {
    for (const id of owned) await connection.db.delete(spaces).where(eq(spaces.id, id));
    await connection.db.delete(user).where(eq(user.id, accountId));
  } finally {
    await connection.close();
  }
});

it("scopes reads and mutations before limiting, and keeps exactly one direct Conversation", async () => {
  const a = await access.create(accountId, { name: "A" });
  const b = await access.create(accountId, { name: "B" });
  owned.push(a.space.id, b.space.id);
  const scopeA = await access.resolve(accountId, a.space.id);
  const scopeB = await access.resolve(accountId, b.space.id);
  const first = await repository.create(scopeA, input);
  const second = await repository.create(scopeB, input);
  const listed = await repository.list(scopeB, 1);
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({
    agent: { ...input, id: second.agent.id, spaceId: b.space.id, lastActivityAt: null },
    conversation: {
      id: second.conversation.id,
      spaceId: b.space.id,
      agentId: second.agent.id,
      kind: "direct",
      lastActivityAt: null,
    },
  });
  const expectedConversation = {
    id: first.conversation.id,
    spaceId: a.space.id,
    agentId: first.agent.id,
    kind: "direct",
    createdAt: first.conversation.createdAt,
    lastActivityAt: null,
  };
  expect(first).toMatchObject({
    agent: { ...input, spaceId: a.space.id, lastActivityAt: null },
    conversation: expectedConversation,
  });
  const before = await repository.get(scopeA, first.agent.id);
  expect(before).toMatchObject({
    agent: { ...input, id: first.agent.id, spaceId: a.space.id, lastActivityAt: null },
    conversation: expectedConversation,
  });
  await expect(repository.get(scopeB, first.agent.id)).rejects.toThrow("not found");
  await expect(
    repository.update(scopeB, first.agent.id, { ...input, name: "Intrusion" }),
  ).rejects.toThrow("not found");
  await expect(repository.delete(scopeB, first.agent.id)).rejects.toThrow("not found");
  expect(await repository.get(scopeA, first.agent.id)).toEqual(before);
  const updated = await repository.update(scopeA, first.agent.id, { ...input, name: "Changed" });
  expect(updated.agent).toMatchObject({
    ...input,
    id: first.agent.id,
    spaceId: a.space.id,
    name: "Changed",
    lastActivityAt: null,
  });
  expect(updated.conversation).toEqual(expectedConversation);
  await expect(
    connection.db.insert(conversations).values({
      id: crypto.randomUUID(),
      spaceId: a.space.id,
      agentId: first.agent.id,
      kind: "direct",
    }),
  ).rejects.toMatchObject({ cause: { code: "23505" } });
  await expect(
    connection.db.insert(conversations).values({
      id: crypto.randomUUID(),
      spaceId: b.space.id,
      agentId: first.agent.id,
      kind: "direct",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await repository.delete(scopeA, first.agent.id);
  expect(
    await connection.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, first.conversation.id)),
  ).toEqual([]);
  await expect(repository.get(scopeA, agentIdSchema.parse(first.conversation.id))).rejects.toThrow(
    "not found",
  );
});

it("rolls back the Agent if its Conversation cannot be inserted", async () => {
  const a = await access.create(accountId, { name: "Atomic" });
  owned.push(a.space.id);
  const scope = await access.resolve(accountId, a.space.id);
  // A temporary constraint in this transaction fails only the Conversation insert.
  await expect(
    connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`alter table conversations add constraint slice_reject_conversation check (false) not valid`,
      );
      await createAgentsRepository(tx).create(scope, input);
    }),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
  expect(await repository.list(scope, 100)).toEqual([]);
});
