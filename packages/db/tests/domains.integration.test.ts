import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vite-plus/test";
import { sql, eq } from "drizzle-orm";
import { createUserAdministration, createReviewApplication } from "@voidmix/application";
import {
  resolveProjectAccessV2,
  type User,
  type UserRepository,
  type ProjectMemberV2,
  type OrganizationMemberV2,
} from "@voidmix/core";
import { openTestDatabase } from "./database.js";
import {
  users,
  auditEvents,
  organizations,
  organizationMembers,
  v2ProjectMembers,
  v2Assets,
  v2Activities,
  v2AssetVersions,
} from "../src/schema.js";
import { PostgresUserRepository } from "../src/identity/postgres.js";
import { InMemoryUserRepository } from "../src/identity/memory.js";
import { PostgresProjectV2Repository } from "../src/v2/projects.js";
import { PostgresAssetV2Repository, PostgresAssetVersionV2Repository } from "../src/v2/assets.js";
import { PostgresActivityV2Repository } from "../src/v2/activity.js";
import { PostgresReviewV2Repository, PostgresFeedbackV2Repository } from "../src/v2/reviews.js";

let connection: Awaited<ReturnType<typeof openTestDatabase>>;
const now = new Date("2026-01-01T00:00:00Z");
const user = (id: string, role: User["role"] = "user"): User => ({
  id,
  email: `${id}@example.com`,
  displayName: id,
  role,
  status: "active",
  createdAt: now,
});
beforeAll(async () => {
  connection = await openTestDatabase();
}, 30_000);
afterAll(async () => {
  await connection?.close();
});
beforeEach(async () => {
  await connection.db.execute(sql`truncate table users cascade`);
  await connection.db
    .insert(users)
    .values([user("owner", "owner"), user("admin", "admin"), user("reader"), user("other")]);
});

async function project(id: string, scope: "personal" | "organization" = "personal") {
  return new PostgresProjectV2Repository(connection.db).create({
    id,
    createdByUserId: "owner",
    scope:
      scope === "personal"
        ? { type: "personal", userId: "owner" }
        : { type: "organization", organizationId: "org" },
    title: id,
    now,
  });
}

describe("PostgreSQL domain guarantees", { concurrent: false }, () => {
  it("returns the same administration results, guards, filtered pages and audits as Memory", async () => {
    async function exercise(users: UserRepository) {
      let sequence = 0;
      const service = createUserAdministration({
        users,
        now: () => now,
        id: () => `parity-${++sequence}`,
      });
      await service.updateStatus({ actorId: "owner", userId: "reader", status: "active" });
      const changed = await service.updateStatus({
        actorId: "owner",
        userId: "admin",
        status: "suspended",
      });
      const guards: string[] = [];
      for (const [actorId, userId] of [
        ["owner", "missing"],
        ["owner", "owner"],
        ["reader", "owner"],
      ]) {
        try {
          await service.updateStatus({ actorId: actorId!, userId: userId!, status: "suspended" });
        } catch (error) {
          guards.push((error as { code: string }).code);
        }
      }
      const input = { email: "PARITY@example.test", displayName: "Parity" };
      const created = await Promise.all([service.ensureAdmin(input), service.ensureAdmin(input)]);
      const page = await service.list({ limit: 1, role: "user", status: "active" });
      const next = await service.list({
        limit: 1,
        role: "user",
        status: "active",
        cursor: page.nextCursor!,
      });
      const audits = await service.audit(100);
      expect(guards).toEqual(["USER_NOT_FOUND", "SELF_SUSPENSION", "LAST_ADMIN"]);
      expect(created[0]).toEqual(created[1]);
      expect(audits).toHaveLength(2);
      expect(changed.createdAt).toBeInstanceOf(Date);
      expect(audits.every((event) => event.occurredAt instanceof Date)).toBe(true);
      return { changed, guards, created, page, next, audits };
    }
    const memory = new InMemoryUserRepository([
      user("owner", "owner"),
      user("admin", "admin"),
      user("reader"),
      user("other"),
    ]);
    expect(await exercise(new PostgresUserRepository(connection.db))).toEqual(
      await exercise(memory),
    );
  });
  it("serializes competing administrator suspensions and commits exactly one audit", async () => {
    const service = createUserAdministration({ users: new PostgresUserRepository(connection.db) });
    const outcomes = await Promise.allSettled([
      service.updateStatus({ actorId: "owner", userId: "admin", status: "suspended" }),
      service.updateStatus({ actorId: "admin", userId: "owner", status: "suspended" }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "LAST_ADMIN" },
    });
    expect(await new PostgresUserRepository(connection.db).countActiveAdministrators()).toBe(1);
    expect(await connection.db.select().from(auditEvents)).toHaveLength(1);
  });
  it("rolls back a status write when its audit foreign key fails", async () => {
    const service = createUserAdministration({ users: new PostgresUserRepository(connection.db) });
    await expect(
      service.updateStatus({ actorId: "missing-actor", userId: "reader", status: "suspended" }),
    ).rejects.toThrow();
    expect(await new PostgresUserRepository(connection.db).getById("reader")).toMatchObject({
      status: "active",
    });
    expect(await connection.db.select().from(auditEvents)).toHaveLength(0);
  });
  it("creates an administrator once across concurrent CLI/API invocations", async () => {
    const service = createUserAdministration({ users: new PostgresUserRepository(connection.db) });
    const input = { email: "BOOTSTRAP@example.com", displayName: "Bootstrap" };
    const [a, b] = await Promise.all([service.ensureAdmin(input), service.ensureAdmin(input)]);
    expect(a).toEqual(b);
    expect(a.email).toBe("bootstrap@example.com");
    expect(await connection.db.select().from(auditEvents)).toHaveLength(1);
  });
  it("preserves no-op and self-suspension guard ordering", async () => {
    const service = createUserAdministration({ users: new PostgresUserRepository(connection.db) });
    await service.updateStatus({ actorId: "owner", userId: "reader", status: "active" });
    expect(await connection.db.select().from(auditEvents)).toHaveLength(0);
    await connection.db.update(users).set({ status: "suspended" }).where(eq(users.id, "owner"));
    await expect(
      service.updateStatus({ actorId: "owner", userId: "owner", status: "suspended" }),
    ).rejects.toMatchObject({ code: "SELF_SUSPENSION" });
  });
  it("filters administrator pages before pagination and counts matches", async () => {
    const repo = new PostgresUserRepository(connection.db);
    const page = await repo.list({ limit: 1, role: "user", status: "active" });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    const next = await repo.list({
      limit: 1,
      role: "user",
      status: "active",
      cursor: page.nextCursor!,
    });
    expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
    expect(next.nextCursor).toBeNull();
  });
  it("matches Core visibility across ownership and every membership combination", async () => {
    await connection.db
      .insert(organizations)
      .values({ id: "org", name: "Organization", createdByUserId: "owner" });
    const projects = [await project("personal"), await project("organization", "organization")];
    const grants: Array<ProjectMemberV2 | undefined> = [
      undefined,
      ...(["active", "removed"] as const).flatMap((status) =>
        (["editor", "commenter", "viewer"] as const).map((role) => ({
          projectId: "",
          userId: "reader",
          status,
          role,
        })),
      ),
    ];
    const memberships: Array<OrganizationMemberV2 | undefined> = [
      undefined,
      ...(["active", "removed"] as const).flatMap((status) =>
        (["owner", "admin", "editor", "viewer"] as const).map((role) => ({
          organizationId: "org",
          userId: "reader",
          status,
          role,
        })),
      ),
    ];
    for (const grant of grants)
      for (const membership of memberships) {
        await connection.db.delete(v2ProjectMembers);
        await connection.db.delete(organizationMembers);
        if (membership)
          await connection.db
            .insert(organizationMembers)
            .values({ id: "membership", ...membership });
        if (grant)
          await connection.db
            .insert(v2ProjectMembers)
            .values(projects.map((p) => ({ ...grant, id: `member-${p.id}`, projectId: p.id })));
        for (const actorId of ["reader", "owner", "other"]) {
          const actual = await new PostgresProjectV2Repository(connection.db).listVisible({
            actorId,
          });
          const expected = projects
            .filter(
              (p) =>
                resolveProjectAccessV2({
                  actorId,
                  project: p,
                  ...(actorId === "reader" && grant ? { projectMember: grant } : {}),
                  ...(actorId === "reader" && membership ? { organizationMember: membership } : {}),
                }) !== "none",
            )
            .map((p) => p.id)
            .sort();
          expect(
            actual.items.map((p) => p.id).sort(),
            JSON.stringify({ actorId, grant, membership }),
          ).toEqual(expected);
        }
      }
  }, 30_000);
  it("pages equal timestamps without duplicates, retains old complete-list calls and rechecks permissions", async () => {
    for (const id of ["a", "b", "c"]) await project(id);
    const repo = new PostgresProjectV2Repository(connection.db);
    const first = await repo.listVisible({ actorId: "owner", limit: 2 });
    expect(first.items.map((p) => p.id)).toEqual(["c", "b"]);
    const second = await repo.listVisible({
      actorId: "owner",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((p) => p.id)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
    expect((await repo.listVisible({ actorId: "owner" })).items).toHaveLength(3);
    expect((await repo.listVisible({ actorId: "reader", limit: 2 })).items).toEqual([]);
    await expect(
      repo.listVisible({ actorId: "reader", cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(repo.listVisible({ actorId: "owner", cursor: "invalid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await connection.db.insert(v2ProjectMembers).values(
      ["a", "b", "c"].map((projectId) => ({
        id: `member-${projectId}`,
        projectId,
        userId: "reader",
        role: "viewer" as const,
      })),
    );
    const visible = await repo.listVisible({ actorId: "reader", limit: 1 });
    await connection.db.update(v2ProjectMembers).set({ status: "removed" });
    expect(
      (await repo.listVisible({ actorId: "reader", limit: 1, cursor: visible.nextCursor! })).items,
    ).toEqual([]);
  });
  it("queries cross-project assets and activities with the same visibility and pagination", async () => {
    await project("p");
    await connection.db.insert(v2Assets).values(
      ["a", "b", "c"].map((id) => ({
        id,
        projectId: "p",
        createdByUserId: "owner",
        name: id,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await connection.db.insert(v2Activities).values(
      ["a", "b", "c"].map((id) => ({
        id,
        projectId: "p",
        actorId: "owner",
        type: "test",
        payload: {},
        occurredAt: now,
      })),
    );
    for (const repo of [
      new PostgresAssetV2Repository(connection.db),
      new PostgresActivityV2Repository(connection.db),
    ]) {
      expect((await repo.listVisible({ actorId: "reader" })).items).toEqual([]);
      const page = await repo.listVisible({ actorId: "owner", limit: 2 });
      expect(page.items.map((item) => item.id)).toEqual(["c", "b"]);
      expect(
        (
          await repo.listVisible({ actorId: "owner", limit: 2, cursor: page.nextCursor! })
        ).items.map((item) => item.id),
      ).toEqual(["a"]);
      await expect(
        repo.listVisible({ actorId: "owner", projectId: "p", cursor: page.nextCursor! }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });
  it("rejects missing or foreign-project asset versions before creating reviews", async () => {
    await project("p");
    await project("q");
    await connection.db
      .insert(v2Assets)
      .values({ id: "asset", projectId: "q", createdByUserId: "owner", name: "Asset" });
    await connection.db.insert(v2AssetVersions).values({
      id: "version",
      assetId: "asset",
      projectId: "q",
      createdByUserId: "owner",
      objectKey: "object",
      byteSize: 1,
      mediaType: "text/plain",
      checksum: "hash",
    });
    const service = createReviewApplication({
      access: {
        requireProject: async () =>
          (await new PostgresProjectV2Repository(connection.db).getById("p"))!,
        assertCapability: async () => {
          throw new Error("unused");
        },
      },
      reviews: new PostgresReviewV2Repository(connection.db),
      feedback: new PostgresFeedbackV2Repository(connection.db),
      assetVersions: new PostgresAssetVersionV2Repository(connection.db),
    });
    for (const assetVersionId of ["missing", "version"])
      await expect(
        service.createReview({ actorId: "owner", projectId: "p", title: "Review", assetVersionId }),
      ).rejects.toMatchObject({ code: "PROJECT_ACCESS_DENIED" });
    expect(await new PostgresReviewV2Repository(connection.db).listByProject("p")).toEqual([]);
  });
});
