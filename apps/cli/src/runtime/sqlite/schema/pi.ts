import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const piContexts = sqliteTable(
  "pi_contexts",
  {
    contextId: text("context_id").primaryKey(),
    revision: integer().notNull(),
    value: text().notNull(),
  },
  (table) => [
    check("revision_positive", sql`${table.revision} > 0`),
    check("revision_integer", sql`typeof(${table.revision}) = 'integer'`),
    check("context_id_text", sql`typeof(${table.contextId}) = 'text'`),
    check("value_text", sql`typeof(${table.value}) = 'text'`),
  ],
);
