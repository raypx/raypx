import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const terminalRequests = sqliteTable("terminal_request", {
  id: text().primaryKey(),
  value: text().notNull(),
});
export const terminalReceipts = sqliteTable("terminal_receipt", {
  id: text().primaryKey(),
  value: text().notNull(),
});
export const terminalSessions = sqliteTable("terminal_session", {
  key: text().primaryKey(),
  value: text().notNull(),
});
export const terminalProjects = sqliteTable("terminal_project", {
  path: text().primaryKey(),
  id: text().notNull().unique(),
});
