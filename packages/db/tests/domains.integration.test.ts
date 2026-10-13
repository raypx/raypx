import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { createReviewApplication } from "@raypx/application";
import {
  resolveProjectAccessV2,
  type ProjectMemberV2,
  type OrganizationMemberV2,
} from "@raypx/core";
import { openTestDatabase } from "./database.js";
import {
  users,
  organizations,
  organizationMembers,
  v2ProjectMembers,
  v2Assets,
  v2Activities,
  v2AssetVersions,
} from "../src/schema.js";
import { PostgresAssetV2Repository, PostgresAssetVersionV2Repository } from "../src/v2/assets.js";
import { PostgresActivityV2Repository } from "../src/v2/activity.js";
import { PostgresReviewV2Repository, PostgresFeedbackV2Repository } from "../src/v2/reviews.js";
import {
  PostgresProjectV2Repository,
  PostgresProjectMemberV2Repository,
} from "../src/v2/projects.js";

let connection: Awaited<ReturnType<typeof openTestDatabase>>;
const now = new Date("2026-01-01T00:00:00Z");
const user = (id: string): typeof users.$inferInsert => ({
  id,
  email: `${id}@example.com`,
  displayName: id,
  role: "user",
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
  await connection.db.insert(users).values([user("owner"), user("reader"), user("other")]);
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
  it("matches Core visibility across ownership and every membership combination", async () => {
    await connection.db
      .insert(organizations)
      .values({ id: "org", name: "Organization", createdByUserId: "owner" });
    const repository = new PostgresProjectV2Repository(connection.db);
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
          const actual = (await repository.listVisible({ actorId })).items.map((p) => p.id).sort();
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
          expect(actual, JSON.stringify({ actorId, grant, membership })).toEqual(expected);
        }
      }
  }, 30_000);
  it("pages equal timestamps without duplicates, retains old complete-list calls and rechecks permissions", async () => {
    for (const id of ["a", "b", "c"]) await project(id);
    const repository = new PostgresProjectV2Repository(connection.db);
    const members = new PostgresProjectMemberV2Repository(connection.db);
    const first = await repository.listVisible({ actorId: "owner", limit: 2 });
    expect(first.items.map((p) => p.id)).toEqual(["c", "b"]);
    expect(first.items[0]?.updatedAt).toEqual(now);
    const second = await repository.listVisible({
      actorId: "owner",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((p) => p.id)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
    expect((await repository.listVisible({ actorId: "owner" })).items).toHaveLength(3);
    expect((await repository.listVisible({ actorId: "reader", limit: 2 })).items).toEqual([]);
    await expect(
      repository.listVisible({ actorId: "reader", cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      repository.listVisible({ actorId: "owner", cursor: "invalid" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    for (const projectId of ["a", "b", "c"])
      await members.upsert({ projectId, userId: "reader", role: "viewer", now });
    const visible = await repository.listVisible({ actorId: "reader", limit: 1 });
    for (const projectId of ["a", "b", "c"])
      await members.remove({ projectId, userId: "reader", now });
    expect(
      (await repository.listVisible({ actorId: "reader", limit: 1, cursor: visible.nextCursor! }))
        .items,
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
        requireProject: async () => {
          const result = await new PostgresProjectV2Repository(connection.db).getById("p");
          return result!;
        },
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
