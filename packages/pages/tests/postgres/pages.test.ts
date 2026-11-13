import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  agents,
  conversationCounters,
  conversationMessages,
  conversationRuns,
  conversations,
  pages,
  pageShareLinks,
  pageVersions,
  spaceEvents,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import { agentIdSchema } from "@raypx/core/agents";
import { MAX_PAGE_BYTES, pageIdSchema } from "@raypx/core/pages";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createPagesRepository } from "../../src/server/postgres.js";
import { createPagesService, pageTokenHash } from "../../src/server/service.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const repository = createPagesRepository(connection.db);
const service = createPagesService(repository);
const ownedSpaces: string[] = [];
const ownedAccounts: string[] = [];
beforeAll(async () => {
  await migrateDatabase(url);
});
afterEach(async () => {
  for (const id of ownedSpaces.splice(0))
    await connection.db.delete(spaces).where(eq(spaces.id, id));
  for (const id of ownedAccounts.splice(0)) await connection.db.delete(user).where(eq(user.id, id));
});
afterAll(async () => {
  await connection.close();
});
async function fixture() {
  const owner = crypto.randomUUID();
  const member = crypto.randomUUID();
  ownedAccounts.push(owner, member);
  await connection.db.insert(user).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: member, name: "Member", email: `${member}@example.test` },
  ]);
  const a = await access.create(owner, { name: "Pages A" });
  const b = await access.create(owner, { name: "Pages B" });
  ownedSpaces.push(a.space.id, b.space.id);
  const agentId = agentIdSchema.parse(crypto.randomUUID());
  const foreign = agentIdSchema.parse(crypto.randomUUID());
  await connection.db.insert(agents).values([
    { spaceId: a.space.id, id: agentId, name: "Maintainer", modelId: "fixture", instructions: "" },
    { spaceId: b.space.id, id: foreign, name: "Foreign", modelId: "fixture", instructions: "" },
  ]);
  return {
    owner,
    member,
    agentId,
    foreign,
    a: await access.resolve(owner, a.space.id),
    b: await access.resolve(owner, b.space.id),
  };
}
it("creates immutable versions with CAS conflict, rename, restore, bounds and ordered Space events", async () => {
  const f = await fixture();
  const first = await service.create(f.a, {
    title: "Report",
    kind: "document",
    body: "First",
    agentId: f.agentId,
  });
  const second = await service.update(f.a, first.id, 1, "Second");
  await expect(service.update(f.a, first.id, 1, "Stale")).rejects.toThrow("PAGE_CONFLICT");
  const renamed = await service.rename(f.a, first.id, second.version, "Renamed");
  const restored = await service.restore(f.a, first.id, renamed.version, 1);
  expect(restored).toMatchObject({
    version: 4,
    title: "Report",
    body: "First",
    reason: "restored",
    author: { kind: "member", accountId: f.owner, runId: null },
  });
  expect((await service.get(f.a, first.id, 2)).body).toBe("Second");
  expect((await service.versions(f.a, first.id)).map((version) => version.version)).toEqual([
    4, 3, 2, 1,
  ]);
  expect((await service.versions(f.a, first.id))[0]).not.toHaveProperty("body");
  await expect(service.get(f.b, first.id)).rejects.toThrow("PAGE_NOT_FOUND");
  await expect(
    service.update(f.a, first.id, 4, "中".repeat(Math.floor(MAX_PAGE_BYTES / 3) + 1)),
  ).rejects.toThrow("PAGE_TOO_LARGE");
  const events = await connection.db
    .select()
    .from(spaceEvents)
    .where(eq(spaceEvents.spaceId, f.a.spaceId))
    .orderBy(spaceEvents.id);
  expect(events.map((event) => event.kind)).toEqual([
    "page.created",
    "page.updated",
    "page.updated",
    "page.updated",
  ]);
  expect(JSON.stringify(events)).not.toContain("First");
  await service.delete(f.a, first.id, 4);
  expect(await service.list(f.a)).toEqual([]);
});
it("stores only link hashes, follows current or pinned versions, expires and revokes on the next read", async () => {
  const f = await fixture();
  const page = await service.create(f.a, {
    title: "Report",
    kind: "document",
    body: "One",
    agentId: null,
  });
  const current = await service.createShareLink(f.a, page.id);
  const pinned = await service.createShareLink(f.a, page.id, 1);
  const [stored] = await connection.db
    .select()
    .from(pageShareLinks)
    .where(and(eq(pageShareLinks.spaceId, f.a.spaceId), eq(pageShareLinks.id, current.id)));
  expect(stored!.tokenHash).toBe(await pageTokenHash(current.token));
  expect(JSON.stringify(stored)).not.toContain(current.token);
  expect(JSON.stringify(await service.shareLinks(f.a, page.id))).not.toContain("token");
  await service.update(f.a, page.id, 1, "Two");
  expect((await service.resolveShare(current.token))!.body).toBe("Two");
  expect((await service.resolveShare(pinned.token))!.body).toBe("One");
  await service.revokeShareLinks(f.a, page.id, current.id);
  expect(await service.resolveShare(current.token)).toBeNull();
  expect((await service.resolveShare(pinned.token))!.body).toBe("One");
  await connection.db
    .update(pageShareLinks)
    .set({ expiresAt: new Date("2000-01-01") })
    .where(eq(pageShareLinks.id, pinned.id));
  expect(await service.resolveShare(pinned.token)).toBeNull();
  expect(await service.resolveShare("0".repeat(64))).toBeNull();
  await service.revokeShareLinks(f.a, page.id);
});
it("rejects every cross-Space Page, version and link foreign key including pinned versions", async () => {
  const f = await fixture();
  const page = await service.create(f.a, {
    title: "Local",
    kind: "document",
    body: "One",
    agentId: f.agentId,
  });
  await service.update(f.a, page.id, 1, "Two");
  await expect(
    connection.db.insert(pages).values({
      spaceId: f.b.spaceId,
      id: crypto.randomUUID(),
      title: "Invalid",
      kind: "document",
      agentId: f.agentId,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    connection.db.insert(pageVersions).values({
      spaceId: f.b.spaceId,
      pageId: page.id,
      version: 1,
      title: "Invalid",
      kind: "document",
      body: "",
      author: { kind: "member", accountId: f.owner, runId: null },
      reason: "created",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    connection.db.insert(pageShareLinks).values({
      spaceId: f.b.spaceId,
      id: crypto.randomUUID(),
      pageId: page.id,
      tokenHash: "a".repeat(64),
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  const sameId = await service.create(
    f.b,
    { title: "Other", kind: "document", body: "Foreign", agentId: null },
    undefined,
    pageIdSchema.parse(page.id),
  );
  await expect(
    connection.db.insert(pageShareLinks).values({
      spaceId: f.b.spaceId,
      id: crypto.randomUUID(),
      pageId: sameId.id,
      version: 2,
      tokenHash: "b".repeat(64),
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});
it("permits membership, account and Space deletion with all Page tables populated and retains historical author attribution", async () => {
  const f = await fixture();
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: f.a.spaceId, accountId: f.member, role: "member" });
  const scope = await access.resolve(f.member, f.a.spaceId);
  const page = await service.create(scope, {
    title: "Shared",
    kind: "html",
    body: "<p>One</p>",
    agentId: f.agentId,
  });
  await service.update(scope, page.id, 1, "<p>Two</p>");
  const link = await service.createShareLink(scope, page.id, 1);
  await connection.db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, f.a.spaceId), eq(spaceMembers.accountId, f.member)));
  await expect(access.resolve(f.member, f.a.spaceId)).rejects.toThrow("Space record not found");
  await connection.db.delete(user).where(eq(user.id, f.member));
  expect((await service.get(f.a, page.id, 1)).author.accountId).toBe(f.member);
  await connection.db
    .update(agents)
    .set({ deletedAt: new Date() })
    .where(and(eq(agents.spaceId, f.a.spaceId), eq(agents.id, f.agentId)));
  expect((await service.resolveShare(link.token))!.body).toBe("<p>One</p>");
  await connection.db.delete(spaces).where(eq(spaces.id, f.a.spaceId));
  expect(await connection.db.select().from(pages).where(eq(pages.spaceId, f.a.spaceId))).toEqual(
    [],
  );
  expect(
    await connection.db.select().from(pageVersions).where(eq(pageVersions.spaceId, f.a.spaceId)),
  ).toEqual([]);
  expect(
    await connection.db
      .select()
      .from(pageShareLinks)
      .where(eq(pageShareLinks.spaceId, f.a.spaceId)),
  ).toEqual([]);
  expect(await service.resolveShare(link.token)).toBeNull();
});
it("fences and deduplicates Run writes, confines maintenance, and records a routine Run author", async () => {
  const f = await fixture();
  const conversationId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  await connection.db
    .insert(conversations)
    .values({ spaceId: f.a.spaceId, id: conversationId, agentId: f.agentId, kind: "direct" });
  await connection.db.insert(conversationCounters).values({ spaceId: f.a.spaceId, conversationId });
  await connection.db.insert(conversationMessages).values({
    spaceId: f.a.spaceId,
    conversationId,
    id: messageId,
    sequence: 1,
    authorAccountId: f.owner,
    idempotencyKey: crypto.randomUUID(),
    text: "Routine",
  });
  await connection.db.insert(conversationRuns).values({
    spaceId: f.a.spaceId,
    conversationId,
    id: runId,
    agentId: f.agentId,
    memberAccountId: f.owner,
    messageId,
    messageSequence: 1,
    modelId: "fixture",
    instructions: "",
    trigger: "routine",
    state: "running",
    leaseOwner: "worker",
    fence: 3,
    leaseExpiresAt: new Date(Date.now() + 60_000),
  });
  const actor = {
    kind: "run" as const,
    accountId: f.owner,
    runId,
    agentId: f.agentId,
    mutationKey: "create-mutation",
    execution: { conversationId, ownerId: "worker", fence: 3 },
  };
  const input = {
    title: "Daily report",
    kind: "document" as const,
    body: "One",
    agentId: f.agentId,
  };
  const id = pageIdSchema.parse(crypto.randomUUID());
  const page = await service.create(f.a, input, actor, id);
  expect((await service.create(f.a, input, actor, id)).version).toBe(1);
  const updateActor = { ...actor, mutationKey: "update-mutation" };
  expect((await service.update(f.a, id, 1, "Two", updateActor)).version).toBe(2);
  expect((await service.update(f.a, id, 1, "Two", updateActor)).version).toBe(2);
  expect(await service.versions(f.a, id)).toHaveLength(2);
  expect(page.author).toEqual({ kind: "run", accountId: f.owner, runId });
  await expect(
    service.update(f.a, id, 2, "Stale", {
      ...actor,
      mutationKey: "stale",
      execution: { ...actor.execution, fence: 2 },
    }),
  ).rejects.toThrow("STALE_RUN_FENCE");
  const unmaintained = await service.create(f.a, { ...input, agentId: null });
  await expect(
    service.update(f.a, unmaintained.id, 1, "No", { ...actor, mutationKey: "foreign-maintainer" }),
  ).rejects.toThrow("PAGE_NOT_FOUND");
});
