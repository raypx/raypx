import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  conversationCounters,
  conversationEvents,
  conversationMessages,
  spaces,
  user,
} from "@raypx/database/schema";
import { conversationIdSchema } from "@raypx/core/agents";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import type { SpaceScope } from "@raypx/spaces/server";
import { publishConversationNotice } from "../../src/server/conversations.js";
import {
  createAgentsRepository,
  createConversationsRepository,
  createConversationFanout,
} from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A newly created disposable *_test database is required");
const first = connectDatabase(url),
  second = connectDatabase(url);
const access = createSpaceAccess(first.db);
const writers = [createConversationsRepository(first.db), createConversationsRepository(second.db)];
const owner = `events-${crypto.randomUUID()}`;
let scope: SpaceScope, foreignScope: SpaceScope;
let id = conversationIdSchema.parse("uninitialized");
const agent = { name: "Helper", instructions: "", model: { modelId: "fixture" } };
beforeAll(async () => {
  await migrateDatabase(url);
  await first.db
    .insert(user)
    .values({ id: owner, name: "Fixture", email: `${owner}@example.test` });
  const a = await access.create(owner, { name: "A" }),
    b = await access.create(owner, { name: "B" });
  scope = await access.resolve(owner, a.space.id);
  foreignScope = await access.resolve(owner, b.space.id);
});
beforeEach(async () => {
  id = (await createAgentsRepository(first.db).create(scope, agent)).conversation.id;
});
afterAll(async () => {
  try {
    await first.db.delete(spaces).where(eq(spaces.privateFor, owner));
    if (scope) await first.db.delete(spaces).where(eq(spaces.id, scope.spaceId));
    if (foreignScope) await first.db.delete(spaces).where(eq(spaces.id, foreignScope.spaceId));
    await first.db.delete(user).where(eq(user.id, owner));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
function send(key: string, writer = writers[0]!) {
  return writer.send(scope, id, { idempotencyKey: key, text: "Hello" });
}
it("assigns gapless sequences under concurrent independent writers, including duplicate keys", async () => {
  const results = await Promise.all(
    Array.from({ length: 24 }, (_, i) => send(`concurrent-${Math.floor(i / 2)}`, writers[i % 2])),
  );
  expect(new Set(results.map((message) => message.id)).size).toBe(12);
  const page = await writers[0]!.events(scope, id, 0, 100);
  expect(page.status).toBe("events");
  if (page.status !== "events") throw new Error("Unexpected snapshot");
  expect(page.events.map((entry) => entry.event.sequence)).toEqual(
    Array.from({ length: 24 }, (_, i) => i + 1),
  );
  const duplicate = await writers[1]!.send(scope, id, {
    idempotencyKey: "concurrent-0",
    text: "Changed retry body",
  });
  expect(duplicate).toEqual(results[0]);
  expect((await writers[0]!.snapshot(scope, id)).messages).toHaveLength(12);
});
it("rolls back counter, message, event and notification when a writer fails before commit", async () => {
  const before = await writers[0]!.snapshot(scope, id);
  const failing = createConversationsRepository(first.db, async (tx, notice) => {
    await publishConversationNotice(tx, notice);
    throw new Error("Injected rollback");
  });
  await expect(send("rollback", failing)).rejects.toThrow("Injected rollback");
  expect(await writers[0]!.snapshot(scope, id)).toEqual(before);
  expect((await send("after-rollback")).sequence).toBe(before.cursor + 1);
});
it("reads after a bounded cursor, resumes from a consistent snapshot and remembers retention when all events expire", async () => {
  const snapshot = await writers[0]!.snapshot(scope, id);
  const next = await send("after-snapshot");
  const incremental = await writers[1]!.events(scope, id, snapshot.cursor, 1);
  expect(incremental).toMatchObject({
    status: "events",
    cursor: next.sequence,
    hasMore: true,
    events: [{ message: next }],
  });
  await writers[0]!.retainAfter(scope, id, next.sequence + 1);
  expect(await writers[1]!.events(scope, id, snapshot.cursor, 1)).toEqual({
    status: "snapshot-required",
    cursor: next.sequence + 1,
  });
  expect(await writers[1]!.events(scope, id, next.sequence + 1, 1)).toEqual({
    status: "events",
    events: [],
    cursor: next.sequence + 1,
    hasMore: false,
  });
  expect((await writers[0]!.snapshot(scope, id)).messages.length).toBe((next.sequence + 1) / 2);
  // An idempotent retry still returns its original message after log compaction.
  expect((await send("after-snapshot")).id).toBe(next.id);
});
it("cannot read through another Space and rejects cross-Space foreign keys for every new table", async () => {
  for (const read of [
    () => writers[0]!.events(foreignScope, id, 0, 10),
    () => writers[0]!.snapshot(foreignScope, id),
    () => writers[0]!.send(foreignScope, id, { text: "Intrusion", idempotencyKey: "cross-space" }),
  ])
    await expect(read()).rejects.toThrow("not found");
  await expect(
    first.db
      .insert(conversationCounters)
      .values({ spaceId: foreignScope.spaceId, conversationId: id }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(conversationMessages).values({
      spaceId: foreignScope.spaceId,
      conversationId: id,
      id: "cross",
      sequence: 1,
      authorAccountId: owner,
      idempotencyKey: "cross",
      text: "Cross",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  const other = (await createAgentsRepository(first.db).create(foreignScope, agent)).conversation;
  const stored = await send("same-space-reference");
  await expect(
    first.db.insert(conversationEvents).values({
      spaceId: foreignScope.spaceId,
      conversationId: other.id,
      sequence: stored.sequence,
      kind: "message.created",
      messageId: stored.id,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});
it("delivers content-free committed hints across LISTEN connections; retries and rollbacks publish nothing", async () => {
  const listener = createConversationFanout(url);
  const notices: unknown[] = [];
  const unsubscribe = await listener.subscribe((notice) => notices.push(notice));
  try {
    const committed = await send("notification", writers[1]);
    await expect
      .poll(() => notices)
      .toContainEqual({ conversationId: id, sequence: committed.sequence + 1 });
    const count = notices.length;
    await send("notification");
    const failing = createConversationsRepository(first.db, async (tx, notice) => {
      await publishConversationNotice(tx, notice);
      throw new Error("Rolled back notification");
    });
    await expect(send("rollback-notification", failing)).rejects.toThrow(
      "Rolled back notification",
    );
    // A roundtrip on a separate connection gives pending notifications a chance to arrive.
    await second.db.execute(sql`select 1`);
    expect(notices).toHaveLength(count);
    expect(Object.keys(notices[0] as object).sort()).toEqual(["conversationId", "sequence"]);
    const rows = await first.db
      .select()
      .from(conversationCounters)
      .where(
        and(
          eq(conversationCounters.spaceId, scope.spaceId),
          eq(conversationCounters.conversationId, id),
        ),
      );
    expect(rows[0]!.sequence).toBe(committed.sequence + 1);
  } finally {
    await unsubscribe();
    await listener.close();
  }
});
