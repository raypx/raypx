import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  agents,
  conversations,
  conversationCounters,
  conversationMessages,
  conversationRuns,
  spaceMembers,
  spaceMemoryDocuments,
  spaceMemoryRevisions,
  spaces,
  user,
} from "@raypx/database/schema";
import { and, eq } from "drizzle-orm";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceMemoryIdSchema, type SpaceMemoryInput } from "@raypx/core/space-memory";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createSpaceMemoryRepository } from "../../src/space-server/postgres.js";
import { createSpaceMemoryService } from "../../src/space-server/service.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const repository = createSpaceMemoryRepository(connection.db);
let time = new Date("2026-11-01T00:00:00.000Z");
const memory = createSpaceMemoryService(repository, { now: () => time });
const owner = `memory-${crypto.randomUUID()}`;
const member = `member-${crypto.randomUUID()}`;
const owned: string[] = [];
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db.insert(user).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: member, name: "Member", email: `${member}@example.test` },
  ]);
});
afterAll(async () => {
  try {
    for (const id of owned) await connection.db.delete(spaces).where(eq(spaces.id, id));
    await connection.db.delete(user).where(eq(user.id, owner));
    await connection.db.delete(user).where(eq(user.id, member));
  } finally {
    await connection.close();
  }
});
async function fixture() {
  const a = await access.create(owner, { name: "Memory A" });
  const b = await access.create(owner, { name: "Memory B" });
  owned.push(a.space.id, b.space.id);
  const first = agentIdSchema.parse(crypto.randomUUID());
  const second = agentIdSchema.parse(crypto.randomUUID());
  const foreign = agentIdSchema.parse(crypto.randomUUID());
  await connection.db.insert(agents).values([
    { spaceId: a.space.id, id: first, name: "First", instructions: "", modelId: "fixture" },
    { spaceId: a.space.id, id: second, name: "Second", instructions: "", modelId: "fixture" },
    { spaceId: b.space.id, id: foreign, name: "Foreign", instructions: "", modelId: "fixture" },
  ]);
  return {
    a: await access.resolve(owner, a.space.id),
    b: await access.resolve(owner, b.space.id),
    first,
    second,
    foreign,
  };
}
function input(
  agentId: SpaceMemoryInput["agentId"],
  text: string,
  pinned = false,
): SpaceMemoryInput {
  return {
    scope: agentId ? "agent" : "space",
    agentId,
    title: "Reference",
    text,
    pinned,
    attribution: { speaker: "Author", source: "Conversation" },
  };
}
it("recalls own and shared documents only, rejects cross-Space records and Agent foreign keys", async () => {
  const f = await fixture();
  const own = await memory.create(f.a, input(f.first, "own"));
  const shared = await memory.create(f.a, input(null, "shared"));
  await memory.create(f.a, input(f.second, "other Agent"));
  await memory.create(f.b, input(f.foreign, "other Space"));
  const recall = await memory.recall(f.a, f.first);
  expect(recall.revisions.map((pin) => pin.documentId).sort()).toEqual([own.id, shared.id].sort());
  expect(recall.context).not.toContain("other Agent");
  expect(recall.context).not.toContain("other Space");
  await expect(memory.get(f.b, own.id)).rejects.toThrow("MEMORY_NOT_FOUND");
  await expect(memory.update(f.b, own.id, 1, input(f.foreign, "intrusion"))).rejects.toThrow(
    "MEMORY_NOT_FOUND",
  );
  await expect(memory.create(f.a, input(f.foreign, "intrusion"))).rejects.toThrow(
    "MEMORY_NOT_FOUND",
  );
  await expect(
    connection.db.insert(spaceMemoryDocuments).values({
      spaceId: f.b.spaceId,
      id: crypto.randomUUID(),
      scope: "agent",
      agentId: f.first,
      title: "bad",
      text: "bad",
      attribution: {},
      provenance: {},
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});
it("rejects cross-Space revision parents even when the copied body claims the destination Space", async () => {
  const f = await fixture();
  const local = await memory.create(f.a, input(f.first, "local revision"));
  const foreign = await memory.create(f.b, input(f.foreign, "foreign revision"));
  const localRevision = (await memory.history(f.a, local.id))[0]!;
  const foreignRevision = (await memory.history(f.b, foreign.id))[0]!;
  await expect(
    connection.db.insert(spaceMemoryRevisions).values({
      spaceId: f.b.spaceId,
      documentId: local.id,
      revision: 1,
      reason: "created",
      body: { ...localRevision, spaceId: f.b.spaceId, agentId: f.foreign },
      createdAt: time,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    connection.db.insert(spaceMemoryRevisions).values({
      spaceId: f.a.spaceId,
      documentId: foreign.id,
      revision: 1,
      reason: "created",
      body: { ...foreignRevision, spaceId: f.a.spaceId, agentId: f.first },
      createdAt: time,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    connection.db.insert(spaceMemoryRevisions).values({
      spaceId: f.a.spaceId,
      documentId: local.id,
      revision: 2,
      reason: "edited",
      body: { ...localRevision, spaceId: f.b.spaceId, revision: 2, reason: "edited" },
      createdAt: time,
    }),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
  expect((await memory.history(f.a, local.id)).map((revision) => revision.text)).toEqual([
    "local revision",
  ]);
  expect((await memory.history(f.b, foreign.id)).map((revision) => revision.text)).toEqual([
    "foreign revision",
  ]);
});
it("keeps immutable revisions, removes recall eligibility, restores into a new revision and rejects stale edits", async () => {
  const f = await fixture();
  const original = await memory.create(f.a, input(f.first, "revision one"));
  time = new Date("2026-11-01T00:01:00.000Z");
  const edited = await memory.update(f.a, original.id, 1, input(f.first, "revision two"));
  await expect(memory.update(f.a, original.id, 1, input(f.first, "stale"))).rejects.toThrow(
    "MEMORY_CONFLICT",
  );
  const removed = await memory.remove(f.a, original.id, edited.revision);
  expect(removed.text).toBeNull();
  expect((await memory.recall(f.a, f.first)).context).toBe("");
  expect((await memory.list(f.a)).length).toBe(0);
  expect((await memory.list(f.a, { includeRemoved: true }))[0]!.removed).toBe(true);
  const restored = await memory.restore(f.a, original.id, 3, 1);
  expect(restored).toMatchObject({ revision: 4, text: "revision one", removed: false });
  const history = await memory.history(f.a, original.id);
  expect(history.map((revision) => revision.reason)).toEqual([
    "restored",
    "removed",
    "edited",
    "created",
  ]);
  expect(history[3]!.text).toBe("revision one");
  expect(history[2]!.text).toBe("revision two");
});
it("pins selected memory by complete budget and retains the frozen context independently of edits", async () => {
  const f = await fixture();
  const pinned = await memory.create(f.a, input(f.first, "pinned fact", true));
  const one = await memory.recall(f.a, f.first);
  await memory.create(f.a, input(f.first, "x".repeat(10_000)));
  const recall = await memory.recall(f.a, f.first, one.context.length);
  expect(recall.revisions).toEqual([{ documentId: pinned.id, revision: 1 }]);
  const checkpoint = structuredClone(recall);
  await memory.update(f.a, pinned.id, 1, input(f.first, "changed fact", true));
  expect(checkpoint.context).toContain("pinned fact");
  expect(checkpoint.context).not.toContain("changed fact");
});
it("allows membership, account and Space deletion with memory and immutable histories present", async () => {
  const f = await fixture();
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: f.a.spaceId, accountId: member, role: "member" });
  const memberScope = await access.resolve(member, f.a.spaceId);
  const document = await memory.create(memberScope, input(null, "shared reference"));
  await memory.update(memberScope, document.id, 1, input(null, "shared revision"));
  await connection.db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, f.a.spaceId), eq(spaceMembers.accountId, member)));
  await expect(access.resolve(member, f.a.spaceId)).rejects.toThrow("Space record not found");
  expect((await memory.history(f.a, document.id)).length).toBe(2);
  await connection.db.delete(user).where(eq(user.id, member));
  expect((await memory.get(f.a, document.id)).text).toBe("shared revision");
  await connection.db.delete(spaces).where(eq(spaces.id, f.a.spaceId));
  expect(
    await connection.db
      .select()
      .from(spaceMemoryDocuments)
      .where(eq(spaceMemoryDocuments.spaceId, f.a.spaceId)),
  ).toEqual([]);
  expect(
    await connection.db
      .select()
      .from(spaceMemoryRevisions)
      .where(eq(spaceMemoryRevisions.spaceId, f.a.spaceId)),
  ).toEqual([]);
});
it("does not permit unfenced Run writes", async () => {
  const f = await fixture();
  await expect(
    repository.create(
      f.a,
      spaceMemoryIdSchema.parse(crypto.randomUUID()),
      input(f.first, "bad"),
      { kind: "run", accountId: owner, runId: "missing", untrustedInput: true },
      time,
    ),
  ).rejects.toThrow("STALE_RUN_FENCE");
});
it("fences tool mutations, deduplicates memory writes and preserves untrusted provenance on restore", async () => {
  const f = await fixture();
  const conversationId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  await connection.db
    .insert(conversations)
    .values({ spaceId: f.a.spaceId, id: conversationId, agentId: f.first, kind: "direct" });
  await connection.db
    .insert(conversationCounters)
    .values({ spaceId: f.a.spaceId, conversationId, sequence: 1 });
  await connection.db.insert(conversationMessages).values({
    spaceId: f.a.spaceId,
    conversationId,
    id: messageId,
    sequence: 1,
    authorAccountId: owner,
    idempotencyKey: messageId,
    text: "fixture",
  });
  await connection.db.insert(conversationRuns).values({
    spaceId: f.a.spaceId,
    conversationId,
    id: runId,
    agentId: f.first,
    messageId,
    messageSequence: 1,
    memberAccountId: owner,
    modelId: "fixture",
    instructions: "",
    state: "running",
    leaseOwner: "worker",
    leaseExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    fence: 1,
  });
  const actor = {
    kind: "run" as const,
    accountId: owner,
    runId,
    untrustedInput: true,
    mutationKey: `save-${runId}`,
    execution: { conversationId, ownerId: "worker", fence: 1 },
  };
  const id = spaceMemoryIdSchema.parse(crypto.randomUUID());
  const created = await repository.create(f.a, id, input(f.first, "external fact"), actor, time);
  const repeated = await repository.create(f.a, id, input(f.first, "external fact"), actor, time);
  expect(repeated).toEqual(created);
  await expect(
    repository.create(f.a, id, input(f.first, "changed replay body"), actor, time),
  ).rejects.toThrow("MEMORY_CONFLICT");
  expect((await memory.history(f.a, id)).length).toBe(1);
  expect((await memory.recall(f.a, f.first)).untrustedInput).toBe(true);
  await memory.remove(f.a, id, 1);
  const restored = await memory.restore(f.a, id, 2, 1);
  expect(restored.provenance).toEqual(created.provenance);
  await connection.db
    .update(conversationRuns)
    .set({ fence: 2 })
    .where(and(eq(conversationRuns.spaceId, f.a.spaceId), eq(conversationRuns.id, runId)));
  await expect(
    repository.update(
      f.a,
      id,
      3,
      input(f.first, "stale write"),
      { ...actor, mutationKey: `update-${runId}` },
      time,
    ),
  ).rejects.toThrow("STALE_RUN_FENCE");
  expect((await memory.get(f.a, id)).text).toBe("external fact");
});
