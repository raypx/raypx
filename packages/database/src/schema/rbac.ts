import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { member, organization, user } from "./auth";

// Role enum - predefined roles
export const roleEnum = pgEnum("role", ["owner", "admin", "member", "viewer", "billing"]);

// Permission actions
export const actionEnum = pgEnum("action", ["create", "read", "update", "delete", "manage"]);

// Resources that can be accessed
export const resourceEnum = pgEnum("resource", [
  "organization",
  "member",
  "invitation",
  "billing",
  "subscription",
  "settings",
  "api_key",
  "webhook",
  "audit_log",
]);

// Role definitions - what each role can do
export const rolePermission = pgTable(
  "role_permission",
  {
    id: text("id").primaryKey(),
    role: roleEnum("role").notNull(),
    resource: resourceEnum("resource").notNull(),
    action: actionEnum("action").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("role_permission_role_idx").on(table.role),
    index("role_permission_resource_idx").on(table.resource),
  ],
);

// Custom permissions for specific organizations (override defaults)
export const customPermission = pgTable(
  "custom_permission",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    resource: resourceEnum("resource").notNull(),
    action: actionEnum("action").notNull(),
    granted: text("granted").notNull().default("true"), // "true" or "false"
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("custom_permission_orgId_idx").on(table.organizationId),
    index("custom_permission_memberId_idx").on(table.memberId),
  ],
);

// API Keys for programmatic access
export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(), // Hashed API key
    keyPrefix: text("key_prefix").notNull(), // First 8 chars for identification
    permissions: text("permissions"), // JSON array of permissions
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("api_key_orgId_idx").on(table.organizationId),
    index("api_key_keyPrefix_idx").on(table.keyPrefix),
  ],
);

// Audit log for tracking actions
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g., "member.invite", "settings.update"
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    metadata: text("metadata"), // JSON string with additional details
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_orgId_idx").on(table.organizationId),
    index("audit_log_userId_idx").on(table.userId),
    index("audit_log_createdAt_idx").on(table.createdAt),
  ],
);

// Relations
export const rolePermissionRelations = relations(rolePermission, () => ({}));

export const customPermissionRelations = relations(customPermission, ({ one }) => ({
  organization: one(organization, {
    fields: [customPermission.organizationId],
    references: [organization.id],
  }),
  member: one(member, {
    fields: [customPermission.memberId],
    references: [member.id],
  }),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  organization: one(organization, {
    fields: [apiKey.organizationId],
    references: [organization.id],
  }),
  createdBy: one(user, {
    fields: [apiKey.createdById],
    references: [user.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  organization: one(organization, {
    fields: [auditLog.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
}));

// Default role permissions
export const DEFAULT_ROLE_PERMISSIONS = {
  owner: {
    organization: ["create", "read", "update", "delete", "manage"],
    member: ["create", "read", "update", "delete", "manage"],
    invitation: ["create", "read", "update", "delete", "manage"],
    billing: ["create", "read", "update", "delete", "manage"],
    subscription: ["create", "read", "update", "delete", "manage"],
    settings: ["create", "read", "update", "delete", "manage"],
    api_key: ["create", "read", "update", "delete", "manage"],
    webhook: ["create", "read", "update", "delete", "manage"],
    audit_log: ["read"],
  },
  admin: {
    organization: ["read", "update"],
    member: ["create", "read", "update", "delete"],
    invitation: ["create", "read", "update", "delete"],
    billing: ["read"],
    subscription: ["read"],
    settings: ["read", "update"],
    api_key: ["create", "read", "update", "delete"],
    webhook: ["create", "read", "update", "delete"],
    audit_log: ["read"],
  },
  member: {
    organization: ["read"],
    member: ["read"],
    invitation: ["read"],
    billing: [],
    subscription: [],
    settings: ["read"],
    api_key: ["create", "read"],
    webhook: ["read"],
    audit_log: [],
  },
  viewer: {
    organization: ["read"],
    member: ["read"],
    invitation: [],
    billing: [],
    subscription: [],
    settings: ["read"],
    api_key: [],
    webhook: [],
    audit_log: [],
  },
  billing: {
    organization: ["read"],
    member: [],
    invitation: [],
    billing: ["read", "update", "manage"],
    subscription: ["read", "update", "manage"],
    settings: [],
    api_key: [],
    webhook: [],
    audit_log: [],
  },
} as const;
