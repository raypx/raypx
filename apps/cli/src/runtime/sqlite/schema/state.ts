import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const roots = sqliteTable("roots", { id: text().primaryKey(), value: text().notNull() });
export const jobs = sqliteTable("jobs", { id: text().primaryKey(), value: text().notNull() });
export const runs = sqliteTable("runs", {
  id: text().primaryKey(),
  jobId: text().notNull(),
  startedAt: text().notNull(),
  value: text().notNull(),
});
export const meta = sqliteTable("meta", { key: text().primaryKey(), value: integer().notNull() });
