import type { InferSelectModel } from "drizzle-orm";
import { boolean, index, jsonb, text, uuid, varchar } from "drizzle-orm/pg-core";
import { pgTable, timestamptz } from "../../utils";
import { user } from "./auth";

/**
 * Configuration namespaces for organizing configs
 */
export const configNamespaces = pgTable(
  "config_namespaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }), // lucide icon name
    sortOrder: varchar("sort_order", { length: 10 }).default("0"),
    userId: uuid("user_id")
      .references(() => user.id, {
        onDelete: "cascade",
      })
      .notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_config_namespaces_user_id").on(table.userId),
    index("idx_config_namespaces_name").on(table.name),
  ],
);

export type ConfigNamespace = InferSelectModel<typeof configNamespaces>;

/**
 * Configuration items
 */
export const configs = pgTable(
  "configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: varchar("key", { length: 255 }).notNull(),
    value: text("value"), // stored as string, parsed based on valueType
    valueType: varchar("value_type", { length: 20 }).notNull().default("string"), // string, number, boolean, json
    description: text("description"),
    isSecret: boolean("is_secret").default(false), // for sensitive values like API keys
    metadata: jsonb("metadata"), // additional metadata like validation rules, default value, etc.
    namespaceId: uuid("namespace_id")
      .references(() => configNamespaces.id, {
        onDelete: "cascade",
      })
      .notNull(),
    userId: uuid("user_id")
      .references(() => user.id, {
        onDelete: "cascade",
      })
      .notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_configs_namespace_id").on(table.namespaceId),
    index("idx_configs_user_id").on(table.userId),
    index("idx_configs_key").on(table.key),
    index("idx_configs_namespace_key").on(table.namespaceId, table.key),
  ],
);

export type Config = InferSelectModel<typeof configs>;

/**
 * Configuration history for audit trail
 */
export const configHistory = pgTable(
  "config_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    configId: uuid("config_id")
      .references(() => configs.id, {
        onDelete: "cascade",
      })
      .notNull(),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    changedBy: uuid("changed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    changeReason: text("change_reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_config_history_config_id").on(table.configId),
    index("idx_config_history_changed_by").on(table.changedBy),
  ],
);

export type ConfigHistory = InferSelectModel<typeof configHistory>;
