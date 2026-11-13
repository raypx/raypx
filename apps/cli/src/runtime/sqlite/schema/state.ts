import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const roots = sqliteTable("roots", { id: text().primaryKey(), value: text().notNull() });
export const jobs = sqliteTable("jobs", { id: text().primaryKey(), value: text().notNull() });
export const runs = sqliteTable("runs", {
  id: text().primaryKey(),
  jobId: text().notNull(),
  startedAt: text().notNull(),
  value: text().notNull(),
});
export const meta = sqliteTable("meta", { key: text().primaryKey(), value: integer().notNull() });
export const jobWebhookKeys = sqliteTable("job_webhook_keys", {
  jobId: text().primaryKey(),
  secret: text().notNull(),
});
export const jobFileWatches = sqliteTable("job_file_watches", {
  jobId: text().primaryKey(),
  digest: text().notNull(),
});
export const jobDeliveries = sqliteTable(
  "job_deliveries",
  {
    id: text().primaryKey(),
    digest: text().notNull(),
    receivedAt: integer().notNull(),
  },
  (table) => [index("job_deliveries_received_at").on(table.receivedAt)],
);
