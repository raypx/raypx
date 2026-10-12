import { dateColumn, timestamps, requiredReference } from "./columns.js";
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { roleEnum, userStatusEnum, auditActionEnum, auditTargetTypeEnum } from "./enums.js";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: roleEnum("role").notNull().default("user"),
    status: userStatusEnum("status").notNull().default("active"),
    ...timestamps(),
  },
  (table) => [
    index("users_created_at_idx").on(table.createdAt),
    index("users_status_role_idx").on(table.status, table.role),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: dateColumn("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ...timestamps(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: requiredReference("user_id", () => users.id, "cascade"),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull().default("voidmix"),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: requiredReference("user_id", () => users.id, "cascade"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: dateColumn("access_token_expires_at"),
    refreshTokenExpiresAt: dateColumn("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (table) => [
    index("auth_accounts_user_id_idx").on(table.userId),
    uniqueIndex("auth_accounts_provider_account_idx").on(table.providerId, table.accountId),
  ],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: dateColumn("expires_at").notNull(),
    ...timestamps(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

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
      // No `onUpdate`: PostgreSQL rejects a referential action that would have
      // to write a generated column ("invalid ON UPDATE action for foreign key
      // constraint containing generated column"). `restrict` never writes.
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

export const systemSettings = pgTable(
  "system_settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: dateColumn("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [index("system_settings_updated_by_idx").on(table.updatedBy)],
);

export const systemSecrets = pgTable(
  "system_secrets",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: dateColumn("updated_at").notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [index("system_secrets_updated_by_idx").on(table.updatedBy)],
);
