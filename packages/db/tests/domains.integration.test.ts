import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vite-plus/test";
import { sql, eq } from "drizzle-orm";
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
  v2Projects,
  v2ProjectMembers,
  v2Assets,
  v2Activities,
  v2AssetVersions,
} from "../src/schema.js";
import {
  PostgresAssetV2Repository,
  PostgresAssetVersionV2Repository,
  PostgresActivityV2Repository,
  PostgresReviewV2Repository,
  PostgresFeedbackV2Repository,
} from "../src/v2.js";

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
  return connection.db
    .insert(v2Projects)
    .values({
      id,
      createdByUserId: "owner",
      personalOwnerId: scope === "personal" ? "owner" : null,
      organizationId: scope === "organization" ? "org" : null,
      title: id,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .then((rows) => rows[0]!);
}

describe("PostgreSQL domain guarantees", { concurrent: false }, () => {
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
          const allProjects = await connection.db.select().from(v2Projects);
          const projectMembers = await connection.db
            .select()
            .from(v2ProjectMembers)
            .where(sql`${v2ProjectMembers.userId} = ${actorId}`);
          const orgMembers = await connection.db
            .select()
            .from(organizationMembers)
            .where(sql`${organizationMembers.userId} = ${actorId}`);

          const actual = allProjects
            .filter((p) => {
              const projectMember = projectMembers.find((m) => m.projectId === p.id);
              const organizationMember = orgMembers.find((m) => m.organizationId === p.organizationId);
              return (
                resolveProjectAccessV2({
                  actorId,
                  project: p,
                  ...(projectMember ? { projectMember } : {}),
                  ...(organizationMember ? { organizationMember } : {}),
                }) !== "none"
              );
            })
            .map((p) => p.id)
            .sort();
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
            actual,
            JSON.stringify({ actorId, grant, membership }),
          ).toEqual(expected);
        }
      }
  }, 30_000);
  it("pages equal timestamps without duplicates, retains old complete-list calls and rechecks permissions", async () => {
    for (const id of ["a", "b", "c"]) await project(id);

    // Helper to list visible projects with pagination
    const listVisible = async (actorId: string, limit?: number, cursor?: string) => {
      const allProjects = await connection.db
        .select()
        .from(v2Projects)
        .orderBy(sql`${v2Projects.updatedAt} DESC, ${v2Projects.id} DESC`);

      const projectMembers = await connection.db
        .select()
        .from(v2ProjectMembers)
        .where(sql`${v2ProjectMembers.userId} = ${actorId}`);

      const visibleProjects = allProjects.filter((p) => {
        const projectMember = projectMembers.find((m) => m.projectId === p.id);
        return (
          resolveProjectAccessV2({
            actorId,
            project: p,
            ...(projectMember ? { projectMember } : {}),
          }) !== "none"
        );
      });

      // Apply cursor if provided
      let startIndex = 0;
      if (cursor) {
        const [cursorTime, cursorId] = cursor.split(":");
        startIndex = visibleProjects.findIndex(
          (p) => p.updatedAt.toISOString() === cursorTime && p.id === cursorId
        ) + 1;
      }

      const items = limit ? visibleProjects.slice(startIndex, startIndex + limit) : visibleProjects.slice(startIndex);
      const nextCursor =
        limit && items.length === limit && startIndex + limit < visibleProjects.length
          ? `${items[items.length - 1]!.updatedAt.toISOString()}:${items[items.length - 1]!.id}`
          : null;

      return { items, nextCursor };
    };

    const first = await listVisible("owner", 2);
    expect(first.items.map((p) => p.id)).toEqual(["c", "b"]);
    const second = await listVisible("owner", 2, first.nextCursor!);
    expect(second.items.map((p) => p.id)).toEqual(["a"]);
    expect(second.nextCursor).toBeNull();
    expect((await listVisible("owner")).items).toHaveLength(3);
    expect((await listVisible("reader", 2)).items).toEqual([]);
    await expect(async () => {
      await listVisible("reader", undefined, first.nextCursor!);
    }).rejects.toThrow();
    await expect(async () => {
      await listVisible("owner", undefined, "invalid");
    }).rejects.toThrow();
    await connection.db.insert(v2ProjectMembers).values(
      ["a", "b", "c"].map((projectId) => ({
        id: `member-${projectId}`,
        projectId,
        userId: "reader",
        role: "viewer" as const,
      })),
    );
    const visible = await listVisible("reader", 1);
    await connection.db.update(v2ProjectMembers).set({ status: "removed" });
    expect(
      (await listVisible("reader", 1, visible.nextCursor!)).items,
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
          const [result] = await connection.db
            .select()
            .from(v2Projects)
            .where(eq(v2Projects.id, "p"))
            .limit(1);
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
