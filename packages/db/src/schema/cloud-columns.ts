import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./columns.js";
import { users } from "./identity.js";
import { v2Projects } from "./projects.js";

export function cloudColumns() {
  return {
    id: text("id").primaryKey(),
    scopeType: text("scope_type").notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "restrict" }),
    projectId: text("project_id").references(() => v2Projects.id, { onDelete: "restrict" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "restrict" }),
    parentId: text("parent_id"),
    secondaryParentId: text("secondary_parent_id"),
    idempotencyKey: text("idempotency_key"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    ...timestamps(),
  };
}

export function cloudResourceTable(name: string) {
  return pgTable(name, cloudColumns(), (t) => [
    check(
      `${name}_scope_check`,
      sql`(${t.scopeType}='personal' AND ${t.ownerUserId} IS NOT NULL AND ${t.projectId} IS NULL) OR (${t.scopeType}='project' AND ${t.ownerUserId} IS NULL AND ${t.projectId} IS NOT NULL)`,
    ),
    index(`${name}_scope_created_idx`).on(
      t.scopeType,
      t.ownerUserId,
      t.projectId,
      t.createdAt,
      t.id,
    ),
    index(`${name}_parent_idx`).on(t.parentId),
    index(`${name}_secondary_parent_idx`).on(t.secondaryParentId),
    index(`${name}_actor_idx`).on(t.actorId),
    uniqueIndex(`${name}_actor_intent_idx`).on(t.actorId, t.idempotencyKey),
  ]);
}
