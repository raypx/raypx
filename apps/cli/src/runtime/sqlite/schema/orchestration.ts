import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Durable orchestration domain events, one row per non-activity event. Activity
 * stays a latest-value projection in `activity` and never enters this table, so
 * Desktop history does not double in size. Tasks created before this table
 * existed have no rows here; there is no backfill.
 */
export const taskEvents = sqliteTable(
  "task_events",
  {
    sequence: integer().primaryKey({ autoIncrement: true }),
    id: text().notNull().unique(),
    binding: text().notNull(),
    taskId: text("task_id").notNull(),
    type: text().notNull(),
    value: text().notNull(),
  },
  (table) => [index("task_events_task").on(table.binding, table.taskId, table.sequence)],
);

/**
 * Effect intents and results. An effect is process-bound and never retried after
 * a crash: a startup sweep marks open effects `abandoned`. Settled effects are
 * pruned after seven days.
 */
export const taskEffects = sqliteTable(
  "task_effects",
  {
    id: text().primaryKey(),
    binding: text().notNull(),
    taskId: text("task_id").notNull(),
    type: text().notNull(),
    /** `open` until the worker settles it as `done`, `failed` or `abandoned`. */
    status: text().notNull(),
    value: text().notNull(),
    createdAt: text("created_at").notNull(),
    settledAt: text("settled_at"),
  },
  (table) => [
    index("task_effects_task").on(table.binding, table.taskId),
    index("task_effects_open").on(table.status),
    index("task_effects_settled").on(table.settledAt),
  ],
);
