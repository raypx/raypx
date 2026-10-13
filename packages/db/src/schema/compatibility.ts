import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { cloudResourceTable } from "./cloud-columns.js";
import { createdAt, dateColumn } from "./columns.js";
import { users } from "./identity.js";

// Migration-only definitions preserve retired data without exposing runtime adapters.
export const auditActionEnum = pgEnum("audit_action", [
  "user.status.changed",
  "admin.created",
  "system.settings.updated",
  "system.mail.test.sent",
]);
export const auditTargetTypeEnum = pgEnum("audit_target_type", ["user", "system_setting"]);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    action: auditActionEnum("action").notNull(),
    targetType: auditTargetTypeEnum("target_type").notNull().default("user"),
    targetId: text("target_id").notNull(),
    targetUserId: text("target_user_id")
      .generatedAlwaysAs(sql`case when "target_type" = 'user' then "target_id" else null end`)
      // Referential actions cannot write a generated column.
      .references(() => users.id, { onDelete: "restrict" }),
    occurredAt: dateColumn("occurred_at").notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull(),
  },
  (table) => [
    index("audit_events_occurred_at_idx").on(table.occurredAt),
    index("audit_events_actor_id_idx").on(table.actorId),
    index("audit_events_target_id_idx").on(table.targetId),
    index("audit_events_target_user_id_idx").on(table.targetUserId),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    availableAt: dateColumn("available_at").notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leasedUntil: dateColumn("leased_until"),
    deliveredAt: dateColumn("delivered_at"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    index("outbox_events_available_idx").on(table.availableAt, table.leasedUntil),
    index("outbox_events_delivered_idx").on(table.deliveredAt),
  ],
);

export const cloudPreferences = cloudResourceTable("cloud_preferences");
export const cloudNotifications = cloudResourceTable("cloud_notifications");
