import { sql } from "drizzle-orm";
import { activeTaskStatuses } from "@raypx/core/tasks";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  providers: text().notNull(),
});
export const tasks = sqliteTable(
  "tasks",
  { id: text().primaryKey(), value: text().notNull() },
  (table) => {
    const binding = sql`json_extract(${table.value},'$.binding')`;
    const createdAt = sql`json_extract(${table.value},'$.task.createdAt')`;
    const active = sql`json_extract(${table.value},'$.task.status') IN (${sql.raw(activeTaskStatuses.map((status) => `'${status}'`).join(","))})`;
    return [
      index("tasks_binding_created").on(binding, sql`${createdAt} DESC`, sql`${table.id} ASC`),
      index("tasks_binding_active")
        .on(binding, sql`${createdAt} DESC`, sql`${table.id} ASC`)
        .where(active),
      index("tasks_binding_cursor").on(binding, sql`(${createdAt} || ':' || ${table.id}) DESC`),
      index("tasks_active_session")
        .on(
          sql`json_extract(${table.value},'$.task.provider')`,
          sql`json_extract(${table.value},'$.sessionId')`,
        )
        .where(active),
    ];
  },
);
export const receipts = sqliteTable("receipts", { id: text().primaryKey() });
export const outbox = sqliteTable("outbox", {
  sequence: integer().primaryKey({ autoIncrement: true }),
  id: text().notNull().unique(),
  binding: text().notNull(),
  value: text().notNull(),
});
export const journal = sqliteTable(
  "journal",
  {
    sequence: integer().primaryKey({ autoIncrement: true }),
    id: text().notNull().unique(),
    binding: text().notNull(),
    value: text().notNull(),
  },
  (table) => [
    index("journal_binding").on(table.binding, table.sequence),
    index("journal_task").on(
      table.binding,
      sql`json_extract(${table.value},'$.taskId')`,
      table.sequence,
    ),
  ],
);
export const requests = sqliteTable(
  "requests",
  {
    id: text().primaryKey(),
    binding: text().notNull(),
    value: text().notNull(),
  },
  (table) => [
    index("requests_binding_task").on(table.binding, sql`json_extract(${table.value},'$.taskId')`),
    index("requests_binding_pending")
      .on(table.binding, sql`json_extract(${table.value},'$.expiresAt')`)
      .where(sql`json_extract(${table.value},'$.status') IN ('pending','decided')`),
  ],
);
export const commands = sqliteTable(
  "commands",
  {
    id: text().primaryKey(),
    payload: text().notNull(),
    result: text(),
  },
  (table) => [index("commands_binding").on(sql`json_extract(${table.payload},'$.binding')`)],
);
export const agentMeta = sqliteTable("agent_meta", {
  id: text().primaryKey(),
  value: text().notNull(),
});
export const activity = sqliteTable(
  "activity",
  {
    id: text().primaryKey(),
    binding: text().notNull(),
    taskId: text("task_id").notNull(),
    value: text().notNull(),
  },
  (table) => [
    index("activity_task").on(table.binding, table.taskId),
    index("activity_task_active")
      .on(table.binding, table.taskId)
      .where(
        sql`json_extract(${table.value},'$.status') IN ('streaming','running','queued','sending')`,
      ),
  ],
);
