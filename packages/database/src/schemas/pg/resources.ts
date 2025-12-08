import { boolean, index, integer, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pgTable, uuidv7 } from "../../utils";

export const resources = pgTable(
  "resources",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    displayName: text("display_name").notNull(),
    isVisible: boolean("is_visible").notNull().default(true),
    ordering: integer("ordering").notNull().default(0),
    schemaName: text("schema_name").notNull().default("public"),
    tableName: text("table_name").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .$onUpdateFn(() => /* @__PURE__ */ new Date()),
  },
  (table) => [
    index("idx_resources_schema_name_table_name").on(table.schemaName, table.tableName),
    unique("resources_schema_name_table_name_unique").on(table.schemaName, table.tableName),
  ],
);
