import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { inArray, or } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { spaces, spaceMembers, user } from "@raypx/database/schema";
import { createApprovalsService } from "@raypx/agents/server";
import { createApprovalsRepository } from "@raypx/agents/server/postgres";
import { createSpaceAccess, createSpaceManagement } from "@raypx/spaces/server/postgres";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../helpers/app.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const storage = connectDatabase(url);
const access = createSpaceAccess(storage.db);
const management = createSpaceManagement(storage.db, { async beforeMemberRemoved() {} });
const approvals = createApprovalsService(createApprovalsRepository(storage.db));
const accounts: string[] = [];
const owned: string[] = [];
beforeAll(() => migrateDatabase(url));
afterEach(async () => {
  if (owned.length || accounts.length)
    await storage.db
      .delete(spaces)
      .where(
        or(
          owned.length ? inArray(spaces.id, owned) : undefined,
          accounts.length ? inArray(spaces.privateFor, accounts) : undefined,
        ),
      );
  if (accounts.length) await storage.db.delete(user).where(inArray(user.id, accounts));
  accounts.length = 0;
  owned.length = 0;
});
afterAll(() => storage.close());

function client(accountId: string) {
  const app = createApiApp({
    spaces: access,
    spaceManagement: management,
    agentApprovals: approvals,
    allowedOrigins: ["https://web.example.test"],
    readSession: async () => ({
      user: {
        id: accountId,
        name: "Fixture",
        email: `${accountId}@example.test`,
        emailVerified: true,
        role: "member",
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
async function fixture() {
  const owner = `gap-owner-${crypto.randomUUID()}`;
  const member = `gap-member-${crypto.randomUUID()}`;
  accounts.push(owner, member);
  await storage.db.insert(user).values(
    [owner, member].map((id) => ({
      id,
      name: "Fixture",
      email: `${id}@example.test`,
    })),
  );
  const created = await access.create(owner, { name: "Effective mode fixture" });
  const spaceId = created.space.id;
  owned.push(spaceId);
  await storage.db.insert(spaceMembers).values({ spaceId, accountId: member, role: "member" });
  return { spaceId, owner, member, ownerClient: client(owner), memberClient: client(member) };
}

it("reveals only each caller's effective mode while preserving owner-only settings", async () => {
  const f = await fixture();
  await f.ownerClient.approvals.updateSettings({
    expectedRevision: 0,
    mode: "never",
    rules: [{ toolName: "computer_read_file", executable: null, decision: "block" }],
  });
  expect(await f.ownerClient.approvals.effectiveMode({ spaceId: f.spaceId })).toMatchObject({
    mode: "never",
    source: "account_default",
  });
  const ownMode = await f.memberClient.approvals.effectiveMode({ spaceId: f.spaceId });
  expect(ownMode).toEqual({
    spaceId: f.spaceId,
    mode: "ask",
    source: "account_default",
    availableModes: [
      { mode: "ask", available: true, reasonCode: null },
      { mode: "never", available: true, reasonCode: null },
      { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
    ],
  });
  expect(ownMode).not.toHaveProperty("rules");
  expect(JSON.stringify(ownMode)).not.toContain("email");
  await expect(f.memberClient.spaces.settings({ spaceId: f.spaceId })).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await f.ownerClient.spaces.setApprovalOverride({ spaceId: f.spaceId, mode: "never" });
  expect(await f.memberClient.approvals.effectiveMode({ spaceId: f.spaceId })).toMatchObject({
    mode: "never",
    source: "space_override",
  });
  await f.ownerClient.spaces.clearApprovalOverride({ spaceId: f.spaceId });
  expect(await f.memberClient.approvals.effectiveMode({ spaceId: f.spaceId })).toMatchObject({
    mode: "ask",
    source: "account_default",
  });
  await f.ownerClient.spaces.removeMember({ spaceId: f.spaceId, accountId: f.member });
  await expect(
    f.memberClient.approvals.effectiveMode({ spaceId: f.spaceId }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it.each([
  { cause: "removed", reason: "SPACE_MEMBER_REMOVED" },
  { cause: "left", reason: "SPACE_MEMBER_LEFT" },
  { cause: "deleting", reason: "SPACE_DELETING" },
] as const)(
  "retains $cause for repair-poll admission after missed fanout",
  async ({ cause, reason }) => {
    const f = await fixture();
    if (cause === "removed")
      await f.ownerClient.spaces.removeMember({ spaceId: f.spaceId, accountId: f.member });
    else if (cause === "left") await f.memberClient.spaces.leave({ spaceId: f.spaceId });
    else await f.ownerClient.spaces.delete({ spaceId: f.spaceId });
    const events =
      cause === "deleting"
        ? []
        : await f.ownerClient.spaces.events({ spaceId: f.spaceId, after: 0, limit: 10 });
    const expectedEvent = expect.objectContaining({
      kind: "space.member.removed",
      payload: { accountId: f.member, reason: cause },
    });
    expect(events.filter((event) => event.kind === "space.member.removed")).toEqual(
      cause === "deleting" ? [] : [expectedEvent],
    );
    await expect(access.resolve(f.member, f.spaceId)).rejects.toMatchObject({
      subscriptionEndReason: reason,
    });
  },
);
