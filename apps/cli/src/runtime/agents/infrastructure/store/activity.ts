import { and, desc, eq, lt, sql } from "drizzle-orm";
import { taskActivitySchema, type TaskActivity } from "@raypx/core/tasks";
import { taskActivityPage } from "@raypx/core/activity";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { LocalError } from "../../../errors";
import type { LocalDatabase } from "../../../sqlite";
import { storedRecord } from "../../../sqlite/records";
import { activity } from "../../../sqlite/schema";
import { isDesktopBinding, type ActivityDraft } from "../../model";
import type { AppendEvent } from "./journal";

/** Revisioned task activity entries; relay bindings also journal each change. */
export class ActivityLog {
  constructor(
    private readonly database: LocalDatabase,
    private readonly append: AppendEvent,
  ) {}

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
  record(binding: string, draft: ActivityDraft): TaskActivity {
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
      if (!isDesktopBinding(binding))
        this.append(
          binding,
          previous?.kind === "message" &&
            entry.kind === "message" &&
            previous.status === "streaming" &&
            entry.status === "streaming" &&
            entry.text.startsWith(previous.text)
            ? {
                id: crypto.randomUUID(),
                taskId: entry.taskId,
                kind: "activity_delta",
                entryId: entry.id,
                baseRevision: previous.revision,
                revision: entry.revision,
                append: entry.text.slice(previous.text.length),
                updatedAt: entry.updatedAt,
                truncated: entry.truncated,
              }
            : {
                id: crypto.randomUUID(),
                taskId: entry.taskId,
                kind: "activity",
                entry,
              },
        );
      return entry;
    });
  }
}
