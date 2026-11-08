import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable(
  "documents",
  {
    owner: text().notNull(),
    id: text().notNull(),
    value: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.owner, table.id] }),
    index("documents_canonical_idx").on(sql`lower(${table.id})`),
  ],
);
export const versions = sqliteTable(
  "versions",
  {
    owner: text().notNull(),
    id: text().notNull(),
    revision: integer().notNull(),
    value: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.owner, table.id, table.revision] })],
);
export const deletedDocuments = sqliteTable("deleted_documents", {
  id: text().primaryKey(),
  owner: text().notNull(),
  revision: integer().notNull(),
});
