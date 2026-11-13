import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  agents,
  conversations,
  conversationCounters,
  conversationMessages,
  conversationRuns,
  spaces,
  spaceMembers,
  user,
  memberSkills,
  memberSkillSpaces,
  spaceSkills,
  agentMemberSkills,
  agentSpaceSkills,
  skillMutations,
} from "@raypx/database/schema";
import { agentIdSchema } from "@raypx/core/agents";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createSkillsRepository } from "../../src/server/postgres.js";
import { createSkillsService } from "../../src/server/service.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const db = connection.db;
const access = createSpaceAccess(db);
const repository = createSkillsRepository(db);
const skills = createSkillsService(repository);
const spaceIds: string[] = [];
const accountIds: string[] = [];
beforeAll(() => migrateDatabase(url));
afterEach(async () => {
  for (const id of spaceIds.splice(0)) await db.delete(spaces).where(eq(spaces.id, id));
  for (const id of accountIds.splice(0)) await db.delete(user).where(eq(user.id, id));
});
afterAll(() => connection.close());
const content = { name: "Reports", description: "Make clear reports", body: "Write a summary." };
async function fixture() {
  const owner = `skill-owner-${crypto.randomUUID()}`;
  const other = `skill-other-${crypto.randomUUID()}`;
  accountIds.push(owner, other);
  await db.insert(user).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: other, name: "Other", email: `${other}@example.test` },
  ]);
  const a = await access.create(owner, { name: "Skill A" });
  const b = await access.create(owner, { name: "Skill B" });
  spaceIds.push(a.space.id, b.space.id);
  await db.insert(spaceMembers).values({ spaceId: a.space.id, accountId: other, role: "member" });
  const agent = agentIdSchema.parse(crypto.randomUUID());
  const foreign = agentIdSchema.parse(crypto.randomUUID());
  await db.insert(agents).values([
    { spaceId: a.space.id, id: agent, name: "Local", instructions: "", modelId: "fixture" },
    { spaceId: b.space.id, id: foreign, name: "Foreign", instructions: "", modelId: "fixture" },
  ]);
  return {
    owner,
    other,
    agent,
    foreign,
    a: await access.resolve(owner, a.space.id),
    b: await access.resolve(owner, b.space.id),
    member: await access.resolve(other, a.space.id),
  };
}
async function runFixture(f: Awaited<ReturnType<typeof fixture>>) {
  const conversationId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  await db
    .insert(conversations)
    .values({ spaceId: f.a.spaceId, id: conversationId, agentId: f.agent, kind: "direct" });
  await db
    .insert(conversationCounters)
    .values({ spaceId: f.a.spaceId, conversationId, sequence: 1 });
  await db.insert(conversationMessages).values({
    spaceId: f.a.spaceId,
    conversationId,
    id: messageId,
    sequence: 1,
    authorAccountId: f.owner,
    idempotencyKey: messageId,
    text: "Learn",
  });
  await db.insert(conversationRuns).values({
    spaceId: f.a.spaceId,
    conversationId,
    id: runId,
    agentId: f.agent,
    messageId,
    messageSequence: 1,
    memberAccountId: f.owner,
    modelId: "fixture",
    instructions: "",
    state: "running",
    leaseOwner: "worker",
    leaseExpiresAt: new Date("2099-01-01T00:00:00Z"),
    fence: 1,
  });
  return {
    agentId: f.agent,
    runId,
    memberAccountId: f.owner,
    execution: { conversationId, ownerId: "worker", fence: 1 },
  };
}
it("keeps account skills private, applies selected availability and includes future Spaces for all", async () => {
  const f = await fixture();
  const shared = await skills.create(f.a, content);
  const selected = await skills.create(
    f.a,
    { ...content, name: "Selected" },
    { mode: "selected", spaceIds: [f.a.spaceId] },
  );
  expect((await skills.list(f.b, true)).map((item) => item.id)).toEqual([shared.id]);
  expect(await skills.list(f.member)).toEqual([]);
  await expect(skills.get(f.member, shared.id)).rejects.toThrow("SKILL_NOT_FOUND");
  await expect(skills.update(f.member, shared.id, content)).rejects.toThrow("SKILL_NOT_FOUND");
  await expect(skills.setAgentSkills(f.member, f.agent, [shared.id])).rejects.toThrow(
    "SKILL_NOT_FOUND",
  );
  await skills.setAgentSkills(f.a, f.agent, [shared.id, selected.id]);
  expect((await skills.runCatalog(f.a, f.agent)).map((item) => item.id).sort()).toEqual(
    [shared.id, selected.id].sort(),
  );
  expect(await skills.runCatalog(f.member, f.agent)).toEqual([]);
  await skills.setAvailability(f.a, shared.id, { mode: "selected", spaceIds: [] });
  expect((await skills.runCatalog(f.a, f.agent)).map((item) => item.id)).toEqual([selected.id]);
  await expect(skills.loadForRun(f.a, f.agent, shared.id)).rejects.toThrow("SKILL_NOT_FOUND");
  await skills.setAvailability(f.a, shared.id, { mode: "all" });
  const future = await access.create(f.owner, { name: "Future" });
  spaceIds.push(future.space.id);
  expect(
    (await skills.list(await access.resolve(f.owner, future.space.id), true)).map(
      (item) => item.id,
    ),
  ).toEqual([shared.id]);
});
it("confines learned skills to their Space and fences/deduplicates each tool mutation", async () => {
  const f = await fixture();
  const actor = await runFixture(f);
  const first = await skills.saveFromRun(f.a, actor, "learn", undefined, content);
  expect(await skills.saveFromRun(f.a, actor, "learn", undefined, content)).toEqual(first);
  expect(await skills.get(f.a, first.id)).toMatchObject({
    ownership: "space",
    spaceId: f.a.spaceId,
    agentId: f.agent,
  });
  await expect(skills.get(f.b, first.id)).rejects.toThrow("SKILL_NOT_FOUND");
  await expect(skills.saveFromRun(f.b, actor, "move", first.id, content)).rejects.toThrow(
    "STALE_RUN_FENCE",
  );
  const own = await skills.create(f.a, content);
  await expect(skills.saveFromRun(f.a, actor, "edit-account", own.id, content)).rejects.toThrow(
    "SKILL_NOT_FOUND",
  );
  await skills.setAgentSkills(f.a, f.agent, [first.id]);
  expect((await skills.loadForRun(f.a, f.agent, first.id)).body).toBe(content.body);
  await expect(
    skills.saveFromRun(f.a, actor, "learn", undefined, { ...content, body: "changed replay" }),
  ).rejects.toThrow("SKILL_CONFLICT");
  await db
    .update(conversationRuns)
    .set({ fence: 2 })
    .where(and(eq(conversationRuns.spaceId, f.a.spaceId), eq(conversationRuns.id, actor.runId)));
  await expect(skills.saveFromRun(f.a, actor, "late", first.id, content)).rejects.toThrow(
    "STALE_RUN_FENCE",
  );
  const resumed = { ...actor, execution: { ...actor.execution, fence: 2 } };
  expect(await skills.saveFromRun(f.a, resumed, "learn", undefined, content)).toEqual(first);
  await skills.delete(f.a, first.id);
  expect(await skills.saveFromRun(f.a, resumed, "learn", undefined, content)).toEqual(first);
  await expect(skills.get(f.a, first.id)).rejects.toThrow("SKILL_NOT_FOUND");
});
it("rejects cross-Space references in every new Space-owned table", async () => {
  const f = await fixture();
  const actor = await runFixture(f);
  const account = await skills.create(f.a, content, { mode: "selected", spaceIds: [f.a.spaceId] });
  const local = await skills.saveFromRun(f.a, actor, "learn", undefined, content);
  const bad = { cause: { code: "23503" } };
  await expect(
    db
      .insert(memberSkillSpaces)
      .values({ skillId: account.id, accountId: f.other, spaceId: f.b.spaceId }),
  ).rejects.toMatchObject(bad);
  await expect(
    db
      .insert(spaceSkills)
      .values({ spaceId: f.b.spaceId, id: crypto.randomUUID(), agentId: f.agent, ...content }),
  ).rejects.toMatchObject(bad);
  await expect(
    db
      .insert(agentMemberSkills)
      .values({ spaceId: f.b.spaceId, agentId: f.agent, accountId: f.owner, skillId: account.id }),
  ).rejects.toMatchObject(bad);
  await expect(
    db
      .insert(agentSpaceSkills)
      .values({ spaceId: f.b.spaceId, agentId: f.foreign, accountId: f.owner, skillId: local.id }),
  ).rejects.toMatchObject(bad);
  await expect(
    db.insert(skillMutations).values({
      spaceId: f.b.spaceId,
      conversationId: actor.execution.conversationId,
      runId: actor.runId,
      toolCallId: "bad",
      skillId: local.id,
      digest: "digest",
      fence: 1,
      result: local,
    }),
  ).rejects.toMatchObject(bad);
  await expect(
    db.insert(memberSkills).values({
      id: crypto.randomUUID(),
      accountId: "missing-account",
      ...content,
      availability: "all",
    }),
  ).rejects.toMatchObject(bad);
});
it("deletes populated memberships, accounts and Spaces without breaking retained learned-skill receipts", async () => {
  const f = await fixture();
  const actor = await runFixture(f);
  const account = await skills.create(f.a, content, { mode: "selected", spaceIds: [f.a.spaceId] });
  const local = await skills.saveFromRun(f.a, actor, "learn", undefined, content);
  await skills.setAgentSkills(f.a, f.agent, [account.id, local.id]);
  await db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, f.a.spaceId), eq(spaceMembers.accountId, f.owner)));
  await expect(access.resolve(f.owner, f.a.spaceId)).rejects.toThrow("Space record not found");
  expect(
    await db.select().from(memberSkillSpaces).where(eq(memberSkillSpaces.skillId, account.id)),
  ).toEqual([]);
  expect(
    await db.select().from(agentMemberSkills).where(eq(agentMemberSkills.skillId, account.id)),
  ).toEqual([]);
  expect(
    await db.select().from(agentSpaceSkills).where(eq(agentSpaceSkills.skillId, local.id)),
  ).toEqual([]);
  expect(await db.select().from(spaceSkills).where(eq(spaceSkills.id, local.id))).toHaveLength(1);
  expect(
    await db.select().from(skillMutations).where(eq(skillMutations.runId, actor.runId)),
  ).toHaveLength(1);
  await db.delete(user).where(eq(user.id, f.owner));
  expect(await db.select().from(memberSkills).where(eq(memberSkills.id, account.id))).toEqual([]);
  // A shared Space retains Agent-created know-how even when its originating actor leaves.
  expect((await skills.get(f.member, local.id)).ownership).toBe("space");
  await db.delete(spaces).where(eq(spaces.id, f.a.spaceId));
  expect(await db.select().from(spaceSkills).where(eq(spaceSkills.id, local.id))).toEqual([]);
  expect(
    await db.select().from(skillMutations).where(eq(skillMutations.runId, actor.runId)),
  ).toEqual([]);
});
