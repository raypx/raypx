import { cursorPage, timestampKey } from "../pagination.js";
import { projectVisibility } from "./visibility.js";
import type { VisibleResourceQuery } from "@voidmix/core";
import { first, inserted } from "./results.js";
import type {
  OrganizationMemberV2,
  OrganizationMemberV2Repository,
  ProjectMemberV2,
  ProjectMemberV2Repository,
  ProjectV2,
  ProjectV2Repository,
} from "@voidmix/core";
import { and, asc, desc, eq } from "drizzle-orm";
import { organizationMembers, v2ProjectMembers, v2Projects } from "../schema.js";
import type { Database } from "./types.js";

const memberColumns = {
  projectId: v2ProjectMembers.projectId,
  userId: v2ProjectMembers.userId,
  role: v2ProjectMembers.role,
  status: v2ProjectMembers.status,
};
const organizationMemberColumns = {
  organizationId: organizationMembers.organizationId,
  userId: organizationMembers.userId,
  role: organizationMembers.role,
  status: organizationMembers.status,
};

export class PostgresProjectV2Repository implements ProjectV2Repository {
  constructor(private readonly db: Database) {}

  async getById(id: string): Promise<ProjectV2 | null> {
    return first(this.db.select().from(v2Projects).where(eq(v2Projects.id, id)).limit(1));
  }

  async listVisible(query: VisibleResourceQuery) {
    const page = cursorPage(query, `projects:${query.actorId}`);
    const time = timestampKey(v2Projects.updatedAt);
    let statement = this.db
      .select()
      .from(v2Projects)
      .where(and(projectVisibility(query.actorId), page.seek(time, v2Projects.id)))
      .orderBy(desc(time), desc(v2Projects.id))
      .$dynamic();
    if (page.limit !== undefined) statement = statement.limit(page.limit + 1);
    return page.finish(await statement, (row) => row.updatedAt);
  }

  async create(input: Parameters<ProjectV2Repository["create"]>[0]): Promise<ProjectV2> {
    return inserted(
      this.db
        .insert(v2Projects)
        .values({
          id: input.id,
          createdByUserId: input.createdByUserId,
          personalOwnerId: input.scope.type === "personal" ? input.scope.userId : null,
          organizationId: input.scope.type === "organization" ? input.scope.organizationId : null,
          title: input.title,
          description: input.description ?? null,
          stage: "draft",
          archived: false,
          deadline: null,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning(),
      "Project insert",
    );
  }

  async update(input: Parameters<ProjectV2Repository["update"]>[0]): Promise<ProjectV2 | null> {
    return first(
      this.db
        .update(v2Projects)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.stage !== undefined ? { stage: input.stage } : {}),
          ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
          updatedAt: input.now,
        })
        .where(eq(v2Projects.id, input.id))
        .returning(),
    );
  }

  async setArchived(input: {
    id: string;
    archived: boolean;
    now: Date;
  }): Promise<ProjectV2 | null> {
    return first(
      this.db
        .update(v2Projects)
        .set({ archived: input.archived, updatedAt: input.now })
        .where(eq(v2Projects.id, input.id))
        .returning(),
    );
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(v2Projects)
      .where(eq(v2Projects.id, id))
      .returning({ id: v2Projects.id });
    return deleted.length > 0;
  }
}

export class PostgresProjectMemberV2Repository implements ProjectMemberV2Repository {
  constructor(private readonly db: Database) {}

  private async mutate<T>(projectId: string, operation: (db: Database) => Promise<T>) {
    return this.db.transaction(async (tx) => {
      // Also serialize insertion of a new, narrowing grant: there may be no member row to lock.
      await tx
        .select({ id: v2Projects.id })
        .from(v2Projects)
        .where(eq(v2Projects.id, projectId))
        .for("update");
      return operation(tx);
    });
  }

  async getByProjectAndUser(input: {
    projectId: string;
    userId: string;
  }): Promise<ProjectMemberV2 | null> {
    return first(
      this.db
        .select(memberColumns)
        .from(v2ProjectMembers)
        .where(
          and(
            eq(v2ProjectMembers.projectId, input.projectId),
            eq(v2ProjectMembers.userId, input.userId),
          ),
        )
        .limit(1),
    );
  }

  async listByProject(projectId: string): Promise<ProjectMemberV2[]> {
    return this.db
      .select(memberColumns)
      .from(v2ProjectMembers)
      .where(eq(v2ProjectMembers.projectId, projectId))
      .orderBy(asc(v2ProjectMembers.userId));
  }

  async upsert(input: {
    projectId: string;
    userId: string;
    role: ProjectMemberV2["role"];
    now: Date;
  }): Promise<ProjectMemberV2> {
    return this.mutate(input.projectId, (db) =>
      inserted(
        db
          .insert(v2ProjectMembers)
          .values({
            id: `project-member-${input.projectId}-${input.userId}`,
            projectId: input.projectId,
            userId: input.userId,
            role: input.role,
            status: "active",
            createdAt: input.now,
            updatedAt: input.now,
          })
          .onConflictDoUpdate({
            target: [v2ProjectMembers.projectId, v2ProjectMembers.userId],
            set: { role: input.role, status: "active", updatedAt: input.now },
          })
          .returning(memberColumns),
        "Project member upsert",
      ),
    );
  }

  async remove(input: {
    projectId: string;
    userId: string;
    now: Date;
  }): Promise<ProjectMemberV2 | null> {
    return this.mutate(input.projectId, (db) =>
      first(
        db
          .update(v2ProjectMembers)
          .set({ status: "removed", updatedAt: input.now })
          .where(
            and(
              eq(v2ProjectMembers.projectId, input.projectId),
              eq(v2ProjectMembers.userId, input.userId),
            ),
          )
          .returning(memberColumns),
      ),
    );
  }
}

export class PostgresOrganizationMemberV2Repository implements OrganizationMemberV2Repository {
  constructor(private readonly db: Database) {}

  async getByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMemberV2 | null> {
    return first(
      this.db
        .select(organizationMemberColumns)
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, input.organizationId),
            eq(organizationMembers.userId, input.userId),
          ),
        )
        .limit(1),
    );
  }

  async listByUser(userId: string): Promise<OrganizationMemberV2[]> {
    return this.db
      .select(organizationMemberColumns)
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));
  }
}
