import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { SnapshotRecord } from "@raypx/contracts/tasks";
import { humanRequestSchema, taskActivitySchema } from "@raypx/core/tasks";
import { iterateRows, type LocalDatabase } from "../../../sqlite/index.ts";
import { storedRecord } from "../../../sqlite/records.ts";
import { activity, requests, tasks } from "../../../sqlite/schema.ts";
import { localAgentTaskSchema } from "../../model.ts";
import { activeTaskFilter, requestTaskId, taskBinding, taskCreatedAt } from "./queries.ts";

const activeActivityFilter = sql`json_extract(${activity.value},'$.status') IN ('streaming','running','queued','sending')`;

function* snapshotActivityRows(database: LocalDatabase, binding: string, taskId: string) {
  const seen = new Set<string>();
  for (const active of [true, false]) {
    const rows = iterateRows(
      database,
      database
        .select({ id: activity.id, value: activity.value })
        .from(activity)
        .where(
          and(
            eq(activity.binding, binding),
            eq(activity.taskId, taskId),
            active ? activeActivityFilter : undefined,
          ),
        )
        .orderBy(desc(sql`rowid`))
        .limit(64),
    );
    let bytes = 0;
    let rowsRead = 0;
    try {
      for (const row of rows) {
        if (!active) {
          const size = Buffer.byteLength(row.value);
          if (rowsRead && bytes + size > 192 * 1024) break;
          rowsRead++;
          bytes += size;
        }
        if (!seen.has(row.id)) {
          seen.add(row.id);
          yield row;
        }
      }
    } finally {
      rows.return();
    }
  }
}

/**
 * A size-bounded relay snapshot of recent and active tasks, their requests and activity.
 * `watermark` reads the journal sequence inside the same transaction.
 */
export function taskSnapshot(database: LocalDatabase, binding: string, watermark: () => number) {
  // The first task read fixes the WAL view for rows, counts and the journal watermark.
  return database.transaction(() => {
    const recent = database
      .$with("recent")
      .as(
        database
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(taskBinding, binding))
          .orderBy(desc(taskCreatedAt), asc(tasks.id))
          .limit(100),
      );
    const selectedIds = database.$with("selected").as(
      database
        .with(recent)
        .select({ id: recent.id })
        .from(recent)
        // SQLite needs this hint to avoid scanning a binding's entire task history.
        // Drizzle has no SQLite INDEXED BY API, so keep this source as a SQL fragment.
        .union(
          database
            .select({ id: sql<string>`${tasks.id}`.as("id") })
            .from(sql`${tasks} INDEXED BY ${sql.identifier("tasks_binding_active")}`)
            .where(and(eq(taskBinding, binding), activeTaskFilter)),
        ),
    );
    const selected = database
      .with(selectedIds)
      .select({ value: tasks.value })
      .from(tasks)
      .innerJoin(selectedIds, eq(tasks.id, selectedIds.id))
      .orderBy(desc(taskCreatedAt), asc(tasks.id))
      .all()
      .map((row) => storedRecord(localAgentTaskSchema, row.value));
    const ids = selected.map((local) => local.task.id);
    const selectedTaskIds = database
      .select({ value: sql<string>`value` })
      .from(sql`json_each(${JSON.stringify(ids)})`);
    const records: SnapshotRecord[] = selected.map((local) => ({
      kind: "task",
      // Reserve the completion flag before computing the byte budget (false is longer than true).
      task: { ...local.task, activityIncomplete: false },
    }));
    for (const row of iterateRows(
      database,
      database
        .select({ value: requests.value })
        .from(requests)
        .where(and(eq(requests.binding, binding), inArray(requestTaskId, selectedTaskIds)))
        .orderBy(sql`rowid`),
    ))
      records.push({ kind: "request", request: storedRecord(humanRequestSchema, row.value) });
    const totals = new Map(
      database
        .select({ taskId: activity.taskId, count: count() })
        .from(activity)
        .where(and(eq(activity.binding, binding), inArray(activity.taskId, selectedTaskIds)))
        .groupBy(activity.taskId)
        .all()
        .map((row) => [row.taskId, row.count]),
    );
    const included = new Map<string, number>();
    let remaining = 32 * 1024 * 1024 - 64 * 1024 - Buffer.byteLength(JSON.stringify(records));
    if (remaining > 128 * 1024) {
      const pages = selected.map((local) => snapshotActivityRows(database, binding, local.task.id));
      try {
        let pending = true;
        let exhausted = false;
        while (pending && !exhausted) {
          pending = false;
          for (const page of pages) {
            const row = page.next();
            if (row.done) continue;
            pending = true;
            const size =
              Buffer.byteLength(row.value.value) +
              Buffer.byteLength(',{"kind":"activity","entry":}');
            if (size > remaining) {
              exhausted = true;
              break;
            }
            const entry = storedRecord(taskActivitySchema, row.value.value);
            records.push({ kind: "activity", entry });
            remaining -= size;
            included.set(entry.taskId, (included.get(entry.taskId) ?? 0) + 1);
          }
        }
      } finally {
        for (const page of pages) page.return();
      }
    }
    for (const record of records)
      if (record.kind === "task")
        record.task = {
          ...record.task,
          activityIncomplete:
            (included.get(record.task.id) ?? 0) < (totals.get(record.task.id) ?? 0),
        };
    return { records, sequence: watermark() };
  });
}
