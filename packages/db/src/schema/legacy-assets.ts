import { dateColumn, createdAt, timestamps, requiredReference } from "./columns.js";
import { index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import {
  assetStatusEnum,
  syncConflictStatusEnum,
  agentRunStatusEnum,
  agentStepStatusEnum,
} from "./enums.js";
import { users } from "./identity.js";
import { projects } from "./legacy-projects.js";

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    path: text("path").notNull(),
    status: assetStatusEnum("status").notNull().default("active"),
    headVersionId: text("head_version_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("assets_workspace_id_path_idx").on(table.workspaceId, table.path),
    index("assets_workspace_id_status_idx").on(table.workspaceId, table.status),
    index("assets_head_version_id_idx").on(table.headVersionId),
  ],
);

export const assetVersions = pgTable(
  "asset_versions",
  {
    id: text("id").primaryKey(),
    assetId: requiredReference("asset_id", () => assets.id, "cascade"),
    workspaceId: text("workspace_id").notNull(),
    blobHash: text("blob_hash").notNull(),
    byteSize: integer("byte_size").notNull(),
    contentType: text("content_type"),
    parentVersionId: text("parent_version_id"),
    createdBy: requiredReference("created_by", () => users.id, "restrict"),
    createdAt: createdAt(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    uniqueIndex("asset_versions_asset_id_idempotency_key_idx").on(
      table.assetId,
      table.idempotencyKey,
    ),
    index("asset_versions_asset_id_created_at_idx").on(table.assetId, table.createdAt),
    index("asset_versions_workspace_id_idx").on(table.workspaceId),
    index("asset_versions_parent_version_id_idx").on(table.parentVersionId),
  ],
);

export const assetReferences = pgTable(
  "asset_references",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => projects.id, "cascade"),
    assetId: requiredReference("asset_id", () => assets.id, "cascade"),
    versionId: text("version_id").references(() => assetVersions.id, { onDelete: "set null" }),
    workspaceId: text("workspace_id").notNull(),
    label: text("label"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("asset_references_project_id_asset_id_idx").on(table.projectId, table.assetId),
    index("asset_references_project_id_created_at_idx").on(table.projectId, table.createdAt),
    index("asset_references_asset_id_idx").on(table.assetId),
  ],
);

export const syncConflicts = pgTable(
  "sync_conflicts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    assetId: requiredReference("asset_id", () => assets.id, "cascade"),
    localVersionId: text("local_version_id"),
    remoteVersionId: text("remote_version_id"),
    expectedHeadVersionId: text("expected_head_version_id"),
    actualHeadVersionId: text("actual_head_version_id"),
    status: syncConflictStatusEnum("status").notNull().default("open"),
    detectedAt: dateColumn("detected_at").notNull().defaultNow(),
    resolvedAt: dateColumn("resolved_at"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("sync_conflicts_workspace_id_status_idx").on(table.workspaceId, table.status),
    index("sync_conflicts_asset_id_idx").on(table.assetId),
    index("sync_conflicts_detected_at_idx").on(table.detectedAt),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    requestedBy: requiredReference("requested_by", () => users.id, "restrict"),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    goal: text("goal").notNull(),
    currentStepId: text("current_step_id"),
    ...timestamps(),
  },
  (table) => [
    index("agent_runs_workspace_id_status_idx").on(table.workspaceId, table.status),
    index("agent_runs_requested_by_idx").on(table.requestedBy),
    index("agent_runs_updated_at_idx").on(table.updatedAt),
  ],
);

export const agentSteps = pgTable(
  "agent_steps",
  {
    id: text("id").primaryKey(),
    runId: requiredReference("run_id", () => agentRuns.id, "cascade"),
    sequence: integer("sequence").notNull(),
    status: agentStepStatusEnum("status").notNull().default("queued"),
    name: text("name").notNull(),
    startedAt: dateColumn("started_at"),
    finishedAt: dateColumn("finished_at"),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("agent_steps_run_id_sequence_idx").on(table.runId, table.sequence),
    index("agent_steps_run_id_status_idx").on(table.runId, table.status),
  ],
);

export const agentLeases = pgTable(
  "agent_leases",
  {
    runId: text("run_id")
      .primaryKey()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    holderId: text("holder_id").notNull(),
    acquiredAt: dateColumn("acquired_at").notNull(),
    heartbeatAt: dateColumn("heartbeat_at").notNull(),
    expiresAt: dateColumn("expires_at").notNull(),
  },
  (table) => [index("agent_leases_expires_at_idx").on(table.expiresAt)],
);
