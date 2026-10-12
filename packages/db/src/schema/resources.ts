import { dateColumn, createdAt, timestamps, requiredReference } from "./columns.js";
import { boolean, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { v2Projects } from "./projects.js";
import { users } from "./identity.js";
import { v2ReviewStatusEnum, v2AgentRunStatusEnum } from "./enums.js";

export const v2Assets = pgTable(
  "assets_v2",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    createdByUserId: requiredReference("created_by_user_id", () => users.id, "restrict"),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
    ...timestamps(),
  },
  (table) => [index("assets_v2_project_updated_idx").on(table.projectId, table.updatedAt)],
);

export const v2AssetVersions = pgTable(
  "asset_versions_v2",
  {
    id: text("id").primaryKey(),
    assetId: requiredReference("asset_id", () => v2Assets.id, "cascade"),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    createdByUserId: requiredReference("created_by_user_id", () => users.id, "restrict"),
    objectKey: text("object_key").notNull(),
    byteSize: integer("byte_size").notNull(),
    mediaType: text("media_type").notNull(),
    checksum: text("checksum").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("asset_versions_v2_object_key_idx").on(table.objectKey),
    index("asset_versions_v2_project_created_idx").on(table.projectId, table.createdAt),
  ],
);

export const v2Reviews = pgTable(
  "reviews_v2",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    assetVersionId: text("asset_version_id").references(() => v2AssetVersions.id, {
      onDelete: "set null",
    }),
    createdByUserId: requiredReference("created_by_user_id", () => users.id, "restrict"),
    status: v2ReviewStatusEnum("status").notNull().default("open"),
    title: text("title").notNull(),
    ...timestamps(),
  },
  (table) => [index("reviews_v2_project_updated_idx").on(table.projectId, table.updatedAt)],
);

export const v2Feedback = pgTable(
  "feedback_v2",
  {
    id: text("id").primaryKey(),
    reviewId: requiredReference("review_id", () => v2Reviews.id, "cascade"),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    authorId: requiredReference("author_id", () => users.id, "restrict"),
    body: text("body").notNull(),
    ...timestamps(),
  },
  (table) => [index("feedback_v2_review_created_idx").on(table.reviewId, table.createdAt)],
);

export const v2Activities = pgTable(
  "activities_v2",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    actorId: requiredReference("actor_id", () => users.id, "restrict"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: dateColumn("occurred_at").notNull().defaultNow(),
  },
  (table) => [index("activities_v2_project_occurred_idx").on(table.projectId, table.occurredAt)],
);

export const v2AgentRuns = pgTable(
  "agent_runs_v2",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    requestedByUserId: requiredReference("requested_by_user_id", () => users.id, "restrict"),
    assetVersionId: text("asset_version_id").references(() => v2AssetVersions.id, {
      onDelete: "set null",
    }),
    status: v2AgentRunStatusEnum("status").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(1),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown> | null>(),
    error: text("error"),
    ...timestamps(),
  },
  (table) => [index("agent_runs_v2_project_status_idx").on(table.projectId, table.status)],
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
