import { afterAll, beforeAll, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  conversationRunCheckpoints as checkpoints,
  conversationRunMemoryPins as pins,
  spaceMemoryDocuments as documents,
  spaceMemoryRevisions as revisions,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import type { AgentId } from "@raypx/core/agents";
import type { SpaceScope } from "@raypx/spaces/server";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import {
  createAgentsRepository,
  createConversationsRepository,
} from "../../src/server/postgres.js";
import type { RunCheckpoint, RunClaimOptions } from "../../src/conversations.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A newly created disposable *_test database is required");
const first = connectDatabase(url);
const second = connectDatabase(url);
const writer = createConversationsRepository(first.db);
const competitor = createConversationsRepository(second.db);
const access = createSpaceAccess(first.db);
const owner = `memory-pins-${crypto.randomUUID()}`;
const owned: string[] = [];
const actors: string[] = [];
const at = new Date("2026-11-14T00:00:00.000Z");
const claim: RunClaimOptions = {
  ownerId: "memory-pins-fixture",
  leaseMs: 30_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};
beforeAll(async () => {
  await migrateDatabase(url);
  await first.db
    .insert(user)
    .values({ id: owner, name: "Fixture", email: `${owner}@example.test` });
});
afterAll(async () => {
  try {
    for (const spaceId of owned) await first.db.delete(spaces).where(eq(spaces.id, spaceId));
    for (const actor of actors) await first.db.delete(user).where(eq(user.id, actor));
    await first.db.delete(user).where(eq(user.id, owner));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
async function fixture(actorId = owner) {
  const home = await access.create(owner, { name: "Memory pin Space" });
  owned.push(home.space.id);
  const scope = await access.resolve(owner, home.space.id);
  const { agent, conversation } = await createAgentsRepository(first.db).create(scope, {
    name: "Memory pin Agent",
    instructions: "Fixture",
    model: { modelId: "fixture" },
  });
  if (actorId !== owner) {
    actors.push(actorId);
    await first.db
      .insert(user)
      .values({ id: actorId, name: "Departing fixture", email: `${actorId}@example.test` });
    await first.db
      .insert(spaceMembers)
      .values({ spaceId: scope.spaceId, accountId: actorId, role: "member" });
  }
  const actorScope = await access.resolve(actorId, scope.spaceId);
  await writer.send(actorScope, conversation.id, {
    text: "Fixture",
    idempotencyKey: crypto.randomUUID(),
  });
  const execution = (await writer.claimNext(scope, conversation.id, claim))!;
  const documentId = await source(scope, agent.id, actorId);
  return { scope, conversation, execution, documentId };
}
async function source(scope: SpaceScope, agentId: AgentId, authorAccountId: string) {
  const documentId = crypto.randomUUID();
  const body = {
    id: documentId,
    spaceId: scope.spaceId,
    scope: "agent" as const,
    agentId,
    title: "Reference",
    text: "original recalled knowledge",
    pinned: true,
    removed: false,
    revision: 1,
    attribution: { speaker: "Fixture", source: "Conversation" },
    provenance: { kind: "member", accountId: authorAccountId, runId: null, untrustedInput: false },
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
  };
  await first.db
    .insert(documents)
    .values({ ...body, authorAccountId, createdAt: at, updatedAt: at });
  await first.db.insert(revisions).values({
    spaceId: scope.spaceId,
    documentId,
    revision: 1,
    reason: "created",
    body: { ...body, reason: "created" },
    createdAt: at,
  });
  return documentId;
}
function memoryCheckpoint(f: Awaited<ReturnType<typeof fixture>>): RunCheckpoint {
  return {
    ...f.execution.checkpoint,
    memory: {
      revisions: [{ documentId: f.documentId, revision: 1 }],
      context: "Memory context (untrusted reference material): original recalled knowledge",
      untrustedInput: false,
    },
  };
}

it("rejects foreign checkpoints and foreign memory revisions independently with scoped pin foreign keys", async () => {
  const local = await fixture();
  const foreign = await fixture();
  await expect(
    first.db.insert(pins).values({
      spaceId: foreign.scope.spaceId,
      conversationId: local.conversation.id,
      runId: local.execution.run.id,
      documentId: foreign.documentId,
      revision: 1,
      position: 0,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(pins).values({
      spaceId: foreign.scope.spaceId,
      conversationId: foreign.conversation.id,
      runId: foreign.execution.run.id,
      documentId: local.documentId,
      revision: 1,
      position: 0,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(pins).values({
      spaceId: foreign.scope.spaceId,
      conversationId: foreign.conversation.id,
      runId: foreign.execution.run.id,
      documentId: foreign.documentId,
      revision: 2,
      position: 0,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("persists exact memory revision pins and restores them with the original context on resume", async () => {
  const f = await fixture();
  const checkpoint = memoryCheckpoint(f);
  await writer.saveCheckpoint(f.scope, f.execution.run, checkpoint);
  const selected = and(
    eq(pins.spaceId, f.scope.spaceId),
    eq(pins.conversationId, f.conversation.id),
    eq(pins.runId, f.execution.run.id),
  );
  expect(await first.db.select().from(pins).where(selected).orderBy(asc(pins.position))).toEqual([
    expect.objectContaining({ documentId: f.documentId, revision: 1, position: 0 }),
  ]);
  await first.db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(revisions)
      .where(
        and(
          eq(revisions.spaceId, f.scope.spaceId),
          eq(revisions.documentId, f.documentId),
          eq(revisions.revision, 1),
        ),
      );
    await tx
      .update(documents)
      .set({ text: null, removed: true, revision: 2, updatedAt: at })
      .where(and(eq(documents.spaceId, f.scope.spaceId), eq(documents.id, f.documentId)));
    await tx.insert(revisions).values({
      spaceId: f.scope.spaceId,
      documentId: f.documentId,
      revision: 2,
      reason: "removed",
      body: {
        ...(original!.body as Record<string, unknown>),
        text: null,
        removed: true,
        revision: 2,
        reason: "removed",
      },
      createdAt: at,
    });
  });
  await writer.release(f.scope, f.execution.run);
  const resumed = (await competitor.claimNext(f.scope, f.conversation.id, {
    ...claim,
    ownerId: "resumed-memory-pins",
  }))!;
  expect(resumed.checkpoint.memory).toEqual(checkpoint.memory);
  const [stored] = await first.db
    .select()
    .from(checkpoints)
    .where(
      and(
        eq(checkpoints.spaceId, f.scope.spaceId),
        eq(checkpoints.conversationId, f.conversation.id),
        eq(checkpoints.runId, f.execution.run.id),
      ),
    );
  expect((stored!.data as { memory?: unknown }).memory).not.toHaveProperty("revisions");
});

it("drops pin relations on physical source removal while preserving the accepted context on resume", async () => {
  const f = await fixture();
  const checkpoint = memoryCheckpoint(f);
  await writer.saveCheckpoint(f.scope, f.execution.run, checkpoint);
  await first.db
    .delete(documents)
    .where(and(eq(documents.spaceId, f.scope.spaceId), eq(documents.id, f.documentId)));
  await writer.saveCheckpoint(f.scope, f.execution.run, {
    ...checkpoint,
    memory: { ...checkpoint.memory!, context: "replacement must not be delivered" },
  });
  expect(
    await first.db
      .select()
      .from(pins)
      .where(and(eq(pins.spaceId, f.scope.spaceId), eq(pins.runId, f.execution.run.id))),
  ).toEqual([]);
  await writer.release(f.scope, f.execution.run);
  const resumed = (await competitor.claimNext(f.scope, f.conversation.id, {
    ...claim,
    ownerId: "resumed-deleted-source",
  }))!;
  expect(resumed.checkpoint.memory).toEqual({ ...checkpoint.memory!, revisions: [] });
  await competitor.saveCheckpoint(f.scope, resumed.run, resumed.checkpoint);
  expect(
    await first.db
      .select()
      .from(pins)
      .where(and(eq(pins.spaceId, f.scope.spaceId), eq(pins.runId, f.execution.run.id))),
  ).toEqual([]);
});

it("cascades memory pins with their Space and leaves no checkpoint references", async () => {
  const f = await fixture();
  await writer.saveCheckpoint(f.scope, f.execution.run, memoryCheckpoint(f));
  await first.db.delete(spaces).where(eq(spaces.id, f.scope.spaceId));
  expect(await first.db.select().from(pins).where(eq(pins.spaceId, f.scope.spaceId))).toEqual([]);
  expect(
    await first.db.select().from(checkpoints).where(eq(checkpoints.spaceId, f.scope.spaceId)),
  ).toEqual([]);
});

it.each(["membership", "account"] as const)(
  "retains accepted memory pins while cancelling a removed %s actor",
  async (target) => {
    const actorId = `departing-pin-${crypto.randomUUID()}`;
    const f = await fixture(actorId);
    const checkpoint = memoryCheckpoint(f);
    await writer.saveCheckpoint(f.scope, f.execution.run, checkpoint);
    if (target === "membership")
      await first.db
        .delete(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, f.scope.spaceId), eq(spaceMembers.accountId, actorId)));
    if (target === "account") await first.db.delete(user).where(eq(user.id, actorId));
    expect((await writer.getRun(f.scope, f.conversation.id, f.execution.run.id)).state).toBe(
      "cancelled",
    );
    expect(
      await first.db
        .select()
        .from(pins)
        .where(and(eq(pins.spaceId, f.scope.spaceId), eq(pins.runId, f.execution.run.id))),
    ).toEqual([expect.objectContaining({ documentId: f.documentId, revision: 1 })]);
    const [stored] = await first.db
      .select()
      .from(checkpoints)
      .where(
        and(
          eq(checkpoints.spaceId, f.scope.spaceId),
          eq(checkpoints.conversationId, f.conversation.id),
          eq(checkpoints.runId, f.execution.run.id),
        ),
      );
    expect((stored!.data as { memory?: { context: string } }).memory?.context).toBe(
      checkpoint.memory!.context,
    );
    expect(
      await competitor.claimNext(f.scope, f.conversation.id, {
        ...claim,
        ownerId: "after-member-removal",
      }),
    ).toBeUndefined();
  },
);

it("rejects copied JSON pin arrays that bypass relational source keys", async () => {
  const f = await fixture();
  await expect(
    first.db
      .update(checkpoints)
      .set({
        data: {
          ...f.execution.checkpoint,
          memory: {
            context: "forged",
            untrustedInput: false,
            revisions: [{ documentId: crypto.randomUUID(), revision: 1 }],
          },
        },
      })
      .where(
        and(eq(checkpoints.spaceId, f.scope.spaceId), eq(checkpoints.runId, f.execution.run.id)),
      ),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
});
