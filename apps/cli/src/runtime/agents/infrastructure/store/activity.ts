import { and, desc, eq, lt, sql } from "drizzle-orm";
import { taskActivitySchema, type TaskActivity } from "@raypx/core/tasks";
import { taskActivityPage } from "@raypx/core/activity";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { LocalError } from "../../../errors";
import type { LocalDatabase } from "../../../sqlite";
import { storedRecord } from "../../../sqlite/records";
import { activity } from "../../../sqlite/schema";
import type { ActivityRecorded } from "../../domain/events";
import { isDesktopBinding } from "../../domain/state";
import type { ActivityDraft } from "../../model";

/** Revisioned task activity entries. The caller projects each change as an event. */
export class ActivityLog {
  constructor(private readonly database: LocalDatabase) {}

  list(binding: string, taskId: string): TaskActivity[] {
    return this.database
      .select({ value: activity.value })
      .from(activity)
      .where(and(eq(activity.binding, binding), eq(activity.taskId, taskId)))
      .orderBy(sql`rowid`)
      .all()
      .map((row) => storedRecord(taskActivitySchema, row.value));
  }
  page(binding: string, taskId: string, before?: number) {
    const rows = this.database
      .select({ value: activity.value })
      .from(activity)
      .where(
        and(
          eq(activity.binding, binding),
          eq(activity.taskId, taskId),
          before === undefined ? undefined : lt(sql`rowid`, before),
        ),
      )
      .orderBy(desc(sql`rowid`))
      .limit(65)
      .all();
    return taskActivityPage(
      rows.map((row) => storedRecord(taskActivitySchema, row.value)),
      before,
    );
  }
  /**
   * Upsert one entry and return it with the event that records the change. The
   * delta shape for a streaming message is decided here, where the previous
   * revision is known; the caller journals it through `wire.ts`.
   */
  record(
    binding: string,
    draft: ActivityDraft,
    eventId: string,
    at: string,
  ): { entry: TaskActivity; event: ActivityRecorded } {
    return this.database.transaction(() => {
      const old = this.database
        .select({
          rowid: sql<number>`rowid`,
          binding: activity.binding,
          taskId: activity.taskId,
          value: activity.value,
        })
        .from(activity)
        .where(eq(activity.id, draft.id))
        .get();
      if (old && (old.binding !== binding || old.taskId !== draft.taskId))
        throw new LocalError("IDEMPOTENCY_CONFLICT", "Activity identity changed");
      if (!old)
        this.database
          .insert(activity)
          .values({ id: draft.id, binding, taskId: draft.taskId, value: "{}" })
          .run();
      const order =
        old?.rowid ??
        this.database
          .select({ rowid: sql<number>`rowid` })
          .from(activity)
          .where(eq(activity.id, draft.id))
          .get()!.rowid;
      const previous = old ? storedRecord(taskActivitySchema, old.value) : undefined;
      const entry = taskActivitySchema.parse(
        normalizeTaskJson({
          ...draft,
          createdAt: previous?.createdAt ?? draft.createdAt,
          order,
          revision: (previous?.revision ?? 0) + 1,
        }),
      );
      this.database
        .update(activity)
        .set({ value: JSON.stringify(entry) })
        .where(eq(activity.id, entry.id))
        .run();
      const delta =
        previous?.kind === "message" &&
        entry.kind === "message" &&
        previous.status === "streaming" &&
        entry.status === "streaming" &&
        entry.text.startsWith(previous.text)
          ? {
              entryId: entry.id,
              baseRevision: previous.revision,
              revision: entry.revision,
              append: entry.text.slice(previous.text.length),
              truncated: entry.truncated,
            }
          : undefined;
      return {
        entry,
        event: {
          type: "activity.recorded",
          id: eventId,
          binding,
          taskId: entry.taskId,
          at,
          entry,
          ...(delta && !isDesktopBinding(binding) ? { delta } : {}),
        },
      };
    });
  }
}
