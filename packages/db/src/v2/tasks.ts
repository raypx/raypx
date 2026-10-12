import { first, inserted } from "./results.js";
import { desc, eq } from "drizzle-orm";
import type { Database } from "./types.js";
import type { ProjectTaskV2Repository, TaskV2 } from "@voidmix/core";
import { v2ProjectTasks } from "../schema.js";
export class PostgresProjectTaskV2Repository implements ProjectTaskV2Repository {
  constructor(private readonly db: Database) {}

  async getById(id: string): Promise<TaskV2 | null> {
    return first(this.db.select().from(v2ProjectTasks).where(eq(v2ProjectTasks.id, id)).limit(1));
  }

  async listByProject(projectId: string): Promise<TaskV2[]> {
    return this.db
      .select()
      .from(v2ProjectTasks)
      .where(eq(v2ProjectTasks.projectId, projectId))
      .orderBy(desc(v2ProjectTasks.updatedAt), desc(v2ProjectTasks.id));
  }

  async create({
    now,
    ...record
  }: Parameters<ProjectTaskV2Repository["create"]>[0]): Promise<TaskV2> {
    return inserted(
      this.db
        .insert(v2ProjectTasks)
        .values({
          ...record,
          status: "todo",
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
      "Task insert",
    );
  }

  async update(input: Parameters<ProjectTaskV2Repository["update"]>[0]): Promise<TaskV2 | null> {
    return first(
      this.db
        .update(v2ProjectTasks)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: input.now,
        })
        .where(eq(v2ProjectTasks.id, input.id))
        .returning(),
    );
  }
}
