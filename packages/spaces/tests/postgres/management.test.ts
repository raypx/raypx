import { afterAll, beforeAll, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  agents,
  computers,
  modelConnections,
  modelConnectionSpaces,
  routineIdentities,
  routines,
  routineSecrets,
  spaceAudit,
  spaceDeletionJobs,
  spaceEvents,
  spaceInvitations,
  spaceMembers,
  spaces,
  spaceSettingsOverrides,
  user,
} from "@raypx/database/schema";
import { SpaceNotFound } from "@raypx/core/spaces";
import { createSpaceAccess, createSpaceManagement } from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("An isolated *_test or *_test_<lane> database is required");
const first = connectDatabase(url, { max: 3 });
const second = connectDatabase(url, { max: 3 });
const access = createSpaceAccess(first.db);
const accounts: string[] = [];
const owned: string[] = [];
let now = new Date("2026-11-14T00:00:00Z");
const hooks = { now: () => now, async beforeMemberRemoved() {} };
const management = createSpaceManagement(first.db, hooks);
const other = createSpaceManagement(second.db, hooks);
beforeAll(() => migrateDatabase(url));
afterAll(async () => {
  try {
    if (owned.length) await first.db.delete(spaces).where(inArray(spaces.id, owned));
    if (accounts.length) await first.db.delete(user).where(inArray(user.id, accounts));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
async function account(role = "member") {
  const id = `membership-${crypto.randomUUID()}`;
  accounts.push(id);
  await first.db.insert(user).values({
    id,
    role,
    name: `Name ${id}`,
    email: `${id}@example.test`,
    image: "https://example.test/avatar.png",
  });
  return id;
}
async function fixture() {
  now = new Date("2026-11-14T00:00:00Z");
  const owner = await account();
  const member = await account();
  const stranger = await account();
  const created = await access.create(owner, { name: "Shared fixture" });
  owned.push(created.space.id);
  await first.db
    .insert(spaceMembers)
    .values({ spaceId: created.space.id, accountId: member, role: "member" });
  return {
    owner,
    member,
    stranger,
    spaceId: created.space.id,
    scope: await access.resolve(owner, created.space.id),
    memberScope: await access.resolve(member, created.space.id),
  };
}
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

it("reads current profile display fields and never reveals member emails to a member", async () => {
  const f = await fixture();
  const members = await management.members(f.memberScope);
  expect(members).toHaveLength(2);
  expect(members.every((entry) => !("email" in entry))).toBe(true);
  expect(members.find((entry) => entry.accountId === f.owner)).toMatchObject({
    name: `Name ${f.owner}`,
    image: "https://example.test/avatar.png",
    role: "owner",
  });
  expect(members.every((entry) => Number.isFinite(Date.parse(entry.createdAt)))).toBe(true);
  await first.db.update(user).set({ name: "Fresh profile" }).where(eq(user.id, f.member));
  expect(
    (await management.members(f.scope)).find((entry) => entry.accountId === f.member),
  ).toMatchObject({ name: "Fresh profile", email: `${f.member}@example.test` });
  await expectCode(management.rename(f.memberScope, { name: "Refused" }), "SPACE_OWNER_REQUIRED");
  await expectCode(management.settings(f.memberScope), "SPACE_OWNER_REQUIRED");
  await expectCode(management.audit(f.memberScope, undefined, 10), "SPACE_OWNER_REQUIRED");
  await expectCode(management.invitations(f.memberScope), "SPACE_OWNER_REQUIRED");
  await expectCode(management.createInvitation(f.memberScope), "SPACE_OWNER_REQUIRED");
  await expectCode(management.removeMember(f.memberScope, f.owner), "SPACE_OWNER_REQUIRED");
  expect((await management.rename(f.scope, { name: "Renamed" })).name).toBe("Renamed");
});

it("serializes last-owner protections, role changes and voluntary leave", async () => {
  const f = await fixture();
  await expectCode(management.updateMemberRole(f.scope, f.owner, "member"), "SPACE_LAST_OWNER");
  await expectCode(management.leave(f.scope), "SPACE_LAST_OWNER");
  await expectCode(management.removeMember(f.scope, f.owner), "SPACE_LAST_OWNER");
  await management.updateMemberRole(f.scope, f.member, "owner");
  const outcomes = await Promise.allSettled([
    management.updateMemberRole(f.scope, f.owner, "member"),
    other.updateMemberRole(await access.resolve(f.member, f.spaceId), f.member, "member"),
  ]);
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const current = await management.members(await access.resolve(f.owner, f.spaceId));
  expect(current.filter((entry) => entry.role === "owner")).toHaveLength(1);
  const leaving = current.find((entry) => entry.role === "member")!;
  await management.leave(await access.resolve(leaving.accountId, f.spaceId));
  await expect(access.resolve(leaving.accountId, f.spaceId)).rejects.toBeInstanceOf(SpaceNotFound);
});

it("rechecks stale role and membership scopes rather than trusting admission objects", async () => {
  const f = await fixture();
  await management.updateMemberRole(f.scope, f.member, "owner");
  await management.updateMemberRole(await access.resolve(f.member, f.spaceId), f.owner, "member");
  await expectCode(management.rename(f.scope, { name: "Stale owner" }), "SPACE_OWNER_REQUIRED");
  await management.removeMember(await access.resolve(f.member, f.spaceId), f.owner);
  await expect(management.get(f.scope)).rejects.toBeInstanceOf(SpaceNotFound);
  await expect(management.members(f.scope)).rejects.toBeInstanceOf(SpaceNotFound);
});

it("deployment admin without membership cannot resolve or read the Space, directory or audit", async () => {
  const f = await fixture();
  const admin = await account("admin");
  await expect(access.resolve(admin, f.spaceId)).rejects.toBeInstanceOf(SpaceNotFound);
  expect((await access.list(admin)).map((entry) => entry.space.id)).not.toContain(f.spaceId);
});

it("returns a seven-day hash-only single-use invitation and previews sharing before membership", async () => {
  const f = await fixture();
  const invitation = await management.createInvitation(f.scope);
  expect(invitation.token).toMatch(/^[a-f0-9]{64}$/);
  expect(Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt)).toBe(
    7 * 24 * 60 * 60 * 1000,
  );
  const [stored] = await first.db
    .select()
    .from(spaceInvitations)
    .where(and(eq(spaceInvitations.spaceId, f.spaceId), eq(spaceInvitations.id, invitation.id)));
  expect(stored!.tokenHash).not.toBe(invitation.token);
  expect(JSON.stringify(stored)).not.toContain(invitation.token);
  const listed = await management.invitations(f.scope);
  expect(listed).toHaveLength(1);
  expect(listed[0]).not.toHaveProperty("token");
  expect(listed[0]).not.toHaveProperty("tokenHash");
  expect(await management.previewInvitation(f.stranger, invitation.token)).toMatchObject({
    spaceName: "Shared fixture",
    inviterName: `Name ${f.owner}`,
    alreadyMember: false,
    shares: ["agents", "conversations", "memory", "routines", "team_computer", "pages"],
  });
  await expect(access.resolve(f.stranger, f.spaceId)).rejects.toBeInstanceOf(SpaceNotFound);
  const accepted = await management.acceptInvitation(f.stranger, invitation.token);
  expect(accepted).toMatchObject({
    joined: true,
    member: { role: "member", accountId: f.stranger },
  });
  expect(await management.acceptInvitation(f.stranger, invitation.token)).toMatchObject({
    joined: false,
    member: { role: "member" },
  });
  const privateId = (await access.list(f.owner)).find((entry) => entry.space.id !== f.spaceId)!
    .space.id;
  await expect(access.resolve(f.stranger, privateId)).rejects.toBeInstanceOf(SpaceNotFound);
});

it("exactly one of two concurrent accounts consumes an invitation", async () => {
  const f = await fixture();
  const another = await account();
  const { token } = await management.createInvitation(f.scope);
  const results = await Promise.allSettled([
    management.acceptInvitation(f.stranger, token),
    other.acceptInvitation(another, token),
  ]);
  expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
  expect(results.find((entry) => entry.status === "rejected")).toMatchObject({
    reason: { code: "INVITATION_CONSUMED" },
  });
});

it("distinguishes expired, cancelled and consumed invitations and persists expiry on read", async () => {
  const f = await fixture();
  const expired = await management.createInvitation(f.scope);
  now = new Date(Date.parse(expired.expiresAt));
  await expectCode(management.previewInvitation(f.stranger, expired.token), "INVITATION_EXPIRED");
  const [persisted] = await first.db
    .select()
    .from(spaceInvitations)
    .where(and(eq(spaceInvitations.spaceId, f.spaceId), eq(spaceInvitations.id, expired.id)));
  expect(persisted!.status).toBe("expired");
  const cancelled = await management.createInvitation(f.scope);
  await management.cancelInvitation(f.scope, cancelled.id);
  await expectCode(
    management.acceptInvitation(f.stranger, cancelled.token),
    "INVITATION_CANCELLED",
  );
  const consumed = await management.createInvitation(f.scope);
  await management.acceptInvitation(f.stranger, consumed.token);
  await expectCode(
    management.acceptInvitation(await account(), consumed.token),
    "INVITATION_CONSUMED",
  );
  const remaining = await management.createInvitation(f.scope);
  expect(await management.cancelInvitations(f.scope)).toEqual({ cancelled: 1 });
  await expectCode(management.previewInvitation(f.member, remaining.token), "INVITATION_CANCELLED");
  await expectCode(management.acceptInvitation(f.member, "missing-token"), "INVITATION_NOT_FOUND");
  const later = await management.createInvitation(f.scope);
  now = new Date(Date.parse(later.expiresAt));
  expect(await management.invitations(f.scope)).toEqual([]);
  const [lazy] = await first.db
    .select()
    .from(spaceInvitations)
    .where(and(eq(spaceInvitations.spaceId, f.spaceId), eq(spaceInvitations.id, later.id)));
  expect(lazy!.status).toBe("expired");
});

it("does not consume an open link for an already admitted member or elevate their role", async () => {
  const f = await fixture();
  const invitation = await management.createInvitation(f.scope);
  expect(await management.acceptInvitation(f.member, invitation.token)).toMatchObject({
    joined: false,
    member: { role: "member" },
  });
  expect(await management.invitations(f.scope)).toHaveLength(1);
  expect(await management.acceptInvitation(f.stranger, invitation.token)).toMatchObject({
    joined: true,
    member: { role: "member" },
  });
});

it("removal retains a paused routine and historical member, deletes its secrets and availability, and returns reassignable routines", async () => {
  const f = await fixture();
  const agentId = crypto.randomUUID();
  const routineId = crypto.randomUUID();
  await first.db.insert(agents).values({
    spaceId: f.spaceId,
    id: agentId,
    name: "Agent",
    modelId: "fixture",
    instructions: "",
  });
  await first.db.insert(routineIdentities).values({ spaceId: f.spaceId, id: routineId });
  await first.db.insert(routines).values({
    spaceId: f.spaceId,
    id: routineId,
    agentId,
    ownerAccountId: f.member,
    name: "Reassign me",
    prompt: "private routine prompt",
    triggers: {},
    enabled: true,
    nextDueAt: now,
  });
  await first.db.insert(routineSecrets).values({
    spaceId: f.spaceId,
    routineId,
    id: crypto.randomUUID(),
    accountId: f.member,
    keyId: "fixture",
    wrappedDataKey: "private",
    ciphertext: "private",
  });
  const connectionId = crypto.randomUUID();
  await first.db.insert(modelConnections).values({
    id: connectionId,
    accountId: f.member,
    secretId: crypto.randomUUID(),
    name: "Private connection",
    kind: "openai",
    models: ["fixture"],
    availability: "selected",
  });
  await first.db
    .insert(modelConnectionSpaces)
    .values({ connectionId, spaceId: f.spaceId, accountId: f.member });
  await first.db.insert(computers).values({
    spaceId: f.spaceId,
    id: crypto.randomUUID(),
    scope: "team",
    provider: "memory",
    createdByAccountId: f.member,
  });
  expect(await management.removeMember(f.scope, f.member)).toEqual({
    accountId: f.member,
    pausedRoutines: [{ id: routineId, name: "Reassign me" }],
  });
  await expect(access.resolve(f.member, f.spaceId)).rejects.toBeInstanceOf(SpaceNotFound);
  const [retained] = await first.db
    .select()
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, f.spaceId), eq(spaceMembers.accountId, f.member)));
  expect(retained!.removedAt).toEqual(now);
  const [paused] = await first.db
    .select()
    .from(routines)
    .where(and(eq(routines.spaceId, f.spaceId), eq(routines.id, routineId)));
  expect(paused).toMatchObject({ enabled: false, nextDueAt: null, ownerAccountId: f.member });
  expect(
    await first.db.select().from(routineSecrets).where(eq(routineSecrets.spaceId, f.spaceId)),
  ).toEqual([]);
  expect(
    await first.db
      .select()
      .from(modelConnectionSpaces)
      .where(eq(modelConnectionSpaces.spaceId, f.spaceId)),
  ).toEqual([]);
  expect(
    await first.db.select().from(modelConnections).where(eq(modelConnections.id, connectionId)),
  ).toHaveLength(1);
  expect(
    await first.db.select().from(computers).where(eq(computers.spaceId, f.spaceId)),
  ).toHaveLength(1);
  const invitation = await management.createInvitation(f.scope);
  expect(await management.acceptInvitation(f.member, invitation.token)).toMatchObject({
    joined: true,
    member: { role: "member" },
  });
  expect(
    (await management.members(f.scope)).filter((entry) => entry.accountId === f.member),
  ).toHaveLength(1);
  expect(
    (await first.db.select().from(routines).where(eq(routines.spaceId, f.spaceId)))[0]!.enabled,
  ).toBe(false);
});

it("owner approval overrides are explicit and clearing restores the absence of an override", async () => {
  const f = await fixture();
  expect(await management.settings(f.scope)).toMatchObject({ approvalMode: null, updatedAt: null });
  expect(await management.setApprovalOverride(f.scope, "never")).toMatchObject({
    approvalMode: "never",
  });
  await expectCode(management.setApprovalOverride(f.memberScope, "ask"), "SPACE_OWNER_REQUIRED");
  await expectCode(management.setApprovalOverride(f.scope, "auto"), "REVIEW_MODEL_NOT_CONFIGURED");
  expect(await management.clearApprovalOverride(f.scope)).toMatchObject({ approvalMode: null });
  expect(
    await first.db
      .select()
      .from(spaceSettingsOverrides)
      .where(eq(spaceSettingsOverrides.spaceId, f.spaceId)),
  ).toEqual([]);
});

it("appends success, refusal and failure audit rows without exposing private routine details", async () => {
  const f = await fixture();
  await management.rename(f.scope, { name: "Success" });
  await expectCode(management.rename(f.memberScope, { name: "Refusal" }), "SPACE_OWNER_REQUIRED");
  const failing = createSpaceManagement(first.db, {
    ...hooks,
    async beforeMemberRemoved() {
      throw new Error("private failure detail");
    },
  });
  await expect(failing.removeMember(f.scope, f.member)).rejects.toThrow("private failure detail");
  expect((await access.resolve(f.member, f.spaceId)).member.role).toBe("member");
  const rows = await first.db.select().from(spaceAudit).where(eq(spaceAudit.spaceId, f.spaceId));
  expect(rows.map((entry) => entry.outcome)).toEqual(
    expect.arrayContaining(["pending", "succeeded", "refused", "failed"]),
  );
  expect(rows.find((entry) => entry.outcome === "failed")).toMatchObject({
    code: "MUTATION_FAILED",
    actorAccountId: f.owner,
    targetId: f.member,
  });
  expect(JSON.stringify(rows)).not.toContain("private failure detail");
  const page1 = await management.audit(f.scope, undefined, 2);
  expect(page1.items).toHaveLength(2);
  const page2 = await management.audit(f.scope, page1.nextCursor!, 2);
  expect(
    page2.items.some((entry) => page1.items.some((otherRow) => otherRow.id === entry.id)),
  ).toBe(false);
  await expectCode(management.audit(f.scope, "unknown-cursor", 2), "INVALID_AUDIT_CURSOR");
});

it("refuses an audited write when audit storage rejects the intent, with no business change", async () => {
  const f = await fixture();
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const fn = `reject_space_audit_${suffix}`;
  const trigger = `reject_space_audit_${suffix}`;
  await first.db.execute(
    sql.raw(
      `CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.space_id = '${f.spaceId}' THEN RAISE EXCEPTION 'fixture audit storage failure'; END IF; RETURN NEW; END $$`,
    ),
  );
  await first.db.execute(
    sql.raw(
      `CREATE TRIGGER "${trigger}" BEFORE INSERT ON space_audit FOR EACH ROW EXECUTE FUNCTION "${fn}"()`,
    ),
  );
  try {
    await expectCode(
      management.rename(f.scope, { name: "Must not commit" }),
      "SPACE_AUDIT_UNAVAILABLE",
    );
    expect((await management.get(f.scope)).name).toBe("Shared fixture");
  } finally {
    await first.db.execute(sql.raw(`DROP TRIGGER "${trigger}" ON space_audit`));
    await first.db.execute(sql.raw(`DROP FUNCTION "${fn}"()`));
  }
});

it("orders Space events and filters before limiting without changing conversation events", async () => {
  const f = await fixture();
  const another = await fixture();
  await management.rename(f.scope, { name: "First" });
  await management.rename(another.scope, { name: "Other Space" });
  await management.updateMemberRole(f.scope, f.member, "owner");
  const invitation = await management.createInvitation(f.scope);
  await management.acceptInvitation(f.stranger, invitation.token);
  await management.removeMember(f.scope, f.stranger);
  const events = await management.events(f.memberScope, 0, 10);
  expect(events.map((entry) => entry.kind)).toEqual([
    "space.renamed",
    "space.member.role_changed",
    "space.member.joined",
    "space.member.removed",
  ]);
  expect(events.map((entry) => entry.id)).toEqual(
    events.map((entry) => entry.id).sort((a, b) => a - b),
  );
  expect(await management.events(f.scope, events[0]!.id, 1)).toEqual([events[1]]);
});

it("claims deletion durably, blocks fresh admission and protects the caller's last private Space", async () => {
  const owner = await account();
  const [privateSpace] = await access.list(owner);
  owned.push(privateSpace!.space.id);
  await expectCode(
    management.delete(await access.resolve(owner, privateSpace!.space.id)),
    "SPACE_LAST_PRIVATE",
  );
  const extra = await access.create(owner, { name: "Another private Space" });
  owned.push(extra.space.id);
  expect(await management.delete(await access.resolve(owner, extra.space.id))).toMatchObject({
    status: "deleting",
  });
  const [job] = await first.db
    .select()
    .from(spaceDeletionJobs)
    .where(eq(spaceDeletionJobs.spaceId, extra.space.id));
  expect(job).toMatchObject({ stage: "claimed", requestedByAccountId: owner });
  await expect(access.resolve(owner, extra.space.id)).rejects.toBeInstanceOf(SpaceNotFound);
  expect((await access.list(owner)).map((entry) => entry.space.id)).not.toContain(extra.space.id);
  await expectCode(
    management.delete(await access.resolve(owner, privateSpace!.space.id)),
    "SPACE_LAST_PRIVATE",
  );
});

it("new tables reject foreign Space references and cascade through Space and account deletion", async () => {
  const f = await fixture();
  const foreign = await fixture();
  const missingSpace = `missing-${crypto.randomUUID()}`;
  const values = {
    audit: {
      spaceId: missingSpace,
      id: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      actorAccountId: f.owner,
      action: "fixture",
      outcome: "succeeded" as const,
    },
    invitation: {
      spaceId: missingSpace,
      id: crypto.randomUUID(),
      tokenHash: crypto.randomUUID(),
      inviterAccountId: f.owner,
      inviterName: "Fixture",
      expiresAt: now,
    },
    settings: { spaceId: missingSpace, approvalMode: "ask" as const, updatedByAccountId: f.owner },
    events: { spaceId: missingSpace, kind: "space.renamed" as const, payload: { name: "Fixture" } },
    deletion: { spaceId: missingSpace, requestedByAccountId: f.owner },
  };
  for (const insert of [
    () => first.db.insert(spaceAudit).values(values.audit),
    () => first.db.insert(spaceInvitations).values(values.invitation),
    () => first.db.insert(spaceSettingsOverrides).values(values.settings),
    () => first.db.insert(spaceEvents).values(values.events),
    () => first.db.insert(spaceDeletionJobs).values(values.deletion),
  ])
    await expect(insert()).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db
      .insert(spaceInvitations)
      .values({ ...values.invitation, spaceId: f.spaceId, inviterAccountId: foreign.owner }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db
      .insert(spaceInvitations)
      .values({ ...values.invitation, spaceId: f.spaceId, consumedByAccountId: foreign.member }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(spaceEvents).values({
      spaceId: f.spaceId,
      kind: "space.member.joined",
      payload: { accountId: foreign.member },
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await management.rename(f.scope, { name: "Rows exist" });
  await management.createInvitation(f.scope);
  await management.setApprovalOverride(f.scope, "ask");
  await management.removeMember(f.scope, f.member);
  await first.db.insert(spaceDeletionJobs).values({ ...values.deletion, spaceId: f.spaceId });
  await first.db.delete(spaces).where(eq(spaces.id, f.spaceId));
  for (const table of [
    spaceAudit,
    spaceInvitations,
    spaceSettingsOverrides,
    spaceEvents,
    spaceDeletionJobs,
  ])
    expect(await first.db.select().from(table).where(eq(table.spaceId, f.spaceId))).toEqual([]);
  const owner = await account();
  const [privateSpace] = await access.list(owner);
  const privateScope = await access.resolve(owner, privateSpace!.space.id);
  owned.push(privateScope.spaceId);
  await management.rename(privateScope, { name: "Deleted account" });
  await management.createInvitation(privateScope);
  await management.setApprovalOverride(privateScope, "ask");
  await first.db
    .insert(spaceDeletionJobs)
    .values({ spaceId: privateScope.spaceId, requestedByAccountId: owner });
  await first.db.delete(user).where(eq(user.id, owner));
  for (const table of [
    spaceAudit,
    spaceInvitations,
    spaceSettingsOverrides,
    spaceEvents,
    spaceDeletionJobs,
  ])
    expect(
      await first.db.select().from(table).where(eq(table.spaceId, privateScope.spaceId)),
    ).toEqual([]);
});
