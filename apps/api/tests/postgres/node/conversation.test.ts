import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { spaces, spaceMembers, user } from "@raypx/database/schema";
import { and, eq, inArray } from "drizzle-orm";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import {
  createConversationsRepository,
  createAgentsRepository,
} from "@raypx/agents/server/postgres";
import { agentIdSchema } from "@raypx/core/agents";
import type { AuthSession } from "@raypx/core/auth";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../helpers/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const owner = `conversation-${crypto.randomUUID()}`;
const stranger = `conversation-${crypto.randomUUID()}`;
const owned: string[] = [];
let actor = owner;
const app = createApiApp({
  spaces: access,
  agents: createAgentsRepository(connection.db),
  conversations: createConversationsRepository(connection.db),
  allowedOrigins: ["https://web.example.test"],
  readSession: async (): Promise<AuthSession> => ({
    user: {
      id: actor,
      name: "Fixture",
      email: `${actor}@example.test`,
      emailVerified: true,
      role: "admin",
    },
    session: { id: "session", userId: actor, expiresAt: new Date(Date.now() + 60_000) },
  }),
});
const client = createApiClient({
  baseUrl: "https://api.example.test",
  headers: { origin: "https://web.example.test" },
  fetch: async (input, init) => app.fetch(new Request(input, init)),
});
const agent = { name: "Helper", instructions: "Keep the original", model: { modelId: "model" } };
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db.insert(user).values(
    [owner, stranger].map((id) => ({
      id,
      name: "Conversation fixture",
      email: `${id}@example.test`,
    })),
  );
});
afterAll(async () => {
  try {
    for (const id of owned) await connection.db.delete(spaces).where(eq(spaces.id, id));
    await connection.db.delete(user).where(inArray(user.id, [owner, stranger]));
  } finally {
    await connection.close();
  }
});

it("Space: lists only the caller's memberships and refuses every Agent procedure in a foreign Space", async () => {
  actor = owner;
  const foreign = await client.spaces.create({ name: "Private work" });
  owned.push(foreign.space.id);
  const saved = await client.agents.create({ spaceId: foreign.space.id, agent });
  actor = stranger;
  const mine = await client.spaces.list({});
  expect(mine).toHaveLength(1);
  expect(mine[0]!.member).toMatchObject({ accountId: stranger, role: "owner" });
  expect(mine.map((entry) => entry.space.id)).not.toContain(foreign.space.id);
  for (const request of [
    () => client.agents.list({ spaceId: foreign.space.id }),
    () => client.agents.get({ spaceId: foreign.space.id, id: saved.agent.id }),
    () => client.agents.create({ spaceId: foreign.space.id, agent }),
    () => client.agents.update({ spaceId: foreign.space.id, id: saved.agent.id, agent }),
    () => client.agents.delete({ spaceId: foreign.space.id, id: saved.agent.id }),
  ])
    await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("SpaceMember: never projects another Space's member or accepts forged member grants", async () => {
  actor = owner;
  const foreign = await client.spaces.create({ name: "Membership" });
  owned.push(foreign.space.id);
  actor = stranger;
  expect(
    (await client.spaces.list({})).every(
      (entry) => entry.member.accountId === stranger && entry.space.id !== foreign.space.id,
    ),
  ).toBe(true);
  for (const method of ["get", "update", "delete"]) {
    const response = await app.request(`/rpc/spaceMembers/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://web.example.test" },
      body: JSON.stringify({
        json: { spaceId: foreign.space.id, accountId: owner, role: "owner" },
      }),
    });
    expect(response.status).toBe(404);
  }
  expect((await access.resolve(owner, foreign.space.id)).member).toEqual(foreign.member);
});

it("Agent: cannot read, overwrite or delete a foreign row using a valid scope in another Space", async () => {
  actor = owner;
  const a = await client.spaces.create({ name: "A" });
  const b = await client.spaces.create({ name: "B" });
  owned.push(a.space.id, b.space.id);
  const saved = await client.agents.create({ spaceId: a.space.id, agent });
  const inB = await client.agents.create({ spaceId: b.space.id, agent });
  expect(await client.agents.list({ spaceId: b.space.id, limit: 1 })).toEqual([inB]);
  for (const request of [
    () => client.agents.get({ spaceId: b.space.id, id: saved.agent.id }),
    () =>
      client.agents.update({
        spaceId: b.space.id,
        id: saved.agent.id,
        agent: { ...agent, name: "Intrusion" },
      }),
    () => client.agents.delete({ spaceId: b.space.id, id: saved.agent.id }),
  ])
    await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await client.agents.get({ spaceId: a.space.id, id: saved.agent.id })).toEqual(saved);
});

it("Conversation: stays inside its Agent's Space for all projections and mutations", async () => {
  actor = owner;
  const a = await client.spaces.create({ name: "Conversation A" });
  const b = await client.spaces.create({ name: "Conversation B" });
  owned.push(a.space.id, b.space.id);
  const saved = await client.agents.create({ spaceId: a.space.id, agent });
  expect(saved.conversation).toMatchObject({
    spaceId: a.space.id,
    agentId: saved.agent.id,
    kind: "direct",
  });
  expect(await client.agents.list({ spaceId: b.space.id })).toEqual([]);
  for (const id of [saved.agent.id, agentIdSchema.parse(saved.conversation.id)]) {
    for (const request of [
      () => client.agents.get({ spaceId: b.space.id, id }),
      () => client.agents.update({ spaceId: b.space.id, id, agent }),
      () => client.agents.delete({ spaceId: b.space.id, id }),
    ])
      await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(
    (
      await client.agents.update({
        spaceId: a.space.id,
        id: saved.agent.id,
        agent: { ...agent, name: "Changed" },
      })
    ).conversation,
  ).toEqual(saved.conversation);
  actor = stranger;
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: a.space.id, accountId: stranger, role: "member" });
  expect(
    (await client.agents.get({ spaceId: a.space.id, id: saved.agent.id })).conversation,
  ).toEqual(saved.conversation);
  await client.agents.update({ spaceId: a.space.id, id: saved.agent.id, agent });
  await connection.db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, a.space.id), eq(spaceMembers.accountId, stranger)));
  await expect(
    client.agents.get({ spaceId: a.space.id, id: saved.agent.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    client.agents.delete({ spaceId: a.space.id, id: saved.agent.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  actor = owner;
  await client.agents.delete({ spaceId: a.space.id, id: saved.agent.id });
  await expect(
    client.agents.get({ spaceId: a.space.id, id: saved.agent.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("Message/Event: commits idempotently, snapshots at a cursor and refuses all reads and writes to non-members", async () => {
  actor = owner;
  const a = await client.spaces.create({ name: "Messages" });
  const b = await client.spaces.create({ name: "Other messages" });
  owned.push(a.space.id, b.space.id);
  const saved = await client.agents.create({ spaceId: a.space.id, agent });
  const selection = { spaceId: a.space.id, conversationId: saved.conversation.id };
  const message = { text: "A member message", idempotencyKey: "retry" };
  const sent = await client.conversations.send({ ...selection, message });
  expect(await client.conversations.send({ ...selection, message })).toEqual(sent);
  expect(sent.author).toEqual({ kind: "member", accountId: owner });
  expect(await client.conversations.events({ ...selection, limit: 1 })).toMatchObject({
    status: "events",
    events: [{ message: sent }],
    cursor: 1,
    hasMore: false,
  });
  const snapshot = await client.conversations.snapshot(selection);
  expect(snapshot).toEqual({ conversation: saved.conversation, messages: [sent], cursor: 1 });
  expect(await client.conversations.events({ ...selection, after: snapshot.cursor })).toEqual({
    status: "events",
    events: [],
    cursor: 1,
    hasMore: false,
  });
  for (const selected of [selection, { ...selection, spaceId: b.space.id }]) {
    actor = selected.spaceId === a.space.id ? stranger : owner;
    for (const request of [
      () => client.conversations.send({ ...selected, message }),
      () => client.conversations.events(selected),
      () => client.conversations.snapshot(selected),
    ])
      await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  actor = owner;
});
