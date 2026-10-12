import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { dateColumn, timestamps, requiredReference } from "./columns.js";
import { users } from "./identity.js";
import { v2Projects, v2ProjectTasks } from "./projects.js";
import { v2AssetVersions } from "./resources.js";
import { v2AgentRunStatusEnum } from "./enums.js";
import type { RunEvent, RunCommand, DeviceProjectBinding } from "@voidmix/core";
export const executionDevices = pgTable(
  "execution_devices",
  {
    id: text("id").primaryKey(),
    ownerUserId: requiredReference("owner_user_id", () => users.id, "cascade"),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    credentialHash: text("credential_hash").notNull(),
    registrationKey: text("registration_key").notNull(),
    revokedAt: dateColumn("revoked_at"),
    lastSeenAt: dateColumn("last_seen_at"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("execution_devices_credential_hash_idx").on(table.credentialHash),
    uniqueIndex("execution_devices_owner_registration_idx").on(
      table.ownerUserId,
      table.registrationKey,
    ),
    index("execution_devices_owner_user_id_idx").on(table.ownerUserId),
  ],
);
export const deviceProjectBindings = pgTable(
  "device_project_bindings",
  {
    deviceId: requiredReference("device_id", () => executionDevices.id, "cascade"),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    localBindingId: text("local_binding_id").notNull(),
    enabled: boolean("enabled").notNull(),
    tools: jsonb("tools").$type<string[]>().notNull(),
    model: jsonb("model").$type<DeviceProjectBinding["model"]>(),
    updatedAt: dateColumn("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceId, table.projectId] }),
    index("device_project_bindings_project_id_idx").on(table.projectId),
  ],
);
export const taskAgentRuns = pgTable(
  "task_agent_runs",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    taskId: requiredReference("task_id", () => v2ProjectTasks.id, "cascade"),
    targetDeviceId: requiredReference("target_device_id", () => executionDevices.id, "restrict"),
    requestedByUserId: requiredReference("requested_by_user_id", () => users.id, "restrict"),
    assetVersionId: text("asset_version_id").references(() => v2AssetVersions.id, {
      onDelete: "set null",
    }),
    status: v2AgentRunStatusEnum("status").notNull(),
    attempt: integer("attempt").notNull(),
    retryOfRunId: text("retry_of_run_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    dispatchReady: boolean("dispatch_ready").notNull().default(false),
    prompt: text("prompt").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown> | null>(),
    error: text("error"),
    lastSeq: integer("last_seq").notNull(),
    claimId: text("claim_id"),
    acceptedAt: dateColumn("accepted_at"),
    completedAt: dateColumn("completed_at"),
    pendingApprovalId: text("pending_approval_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("task_agent_runs_actor_intent_idx").on(
      table.requestedByUserId,
      table.idempotencyKey,
    ),
    uniqueIndex("task_agent_runs_active_task_idx")
      .on(table.taskId)
      .where(sql`${table.status} IN ('queued', 'running', 'waiting_for_approval')`),
    index("task_agent_runs_project_created_idx").on(table.projectId, table.createdAt),
    index("task_agent_runs_device_status_idx").on(table.targetDeviceId, table.status),
    index("task_agent_runs_task_id_idx").on(table.taskId),
    index("task_agent_runs_asset_version_id_idx").on(table.assetVersionId),
    index("task_agent_runs_retry_of_run_id_idx").on(table.retryOfRunId),
  ],
);
export const runCommands = pgTable(
  "run_commands",
  {
    id: text("id").primaryKey(),
    runId: requiredReference("run_id", () => taskAgentRuns.id, "cascade"),
    requestedByUserId: requiredReference("requested_by_user_id", () => users.id, "restrict"),
    idempotencyKey: text("idempotency_key").notNull(),
    type: text("type").$type<RunCommand["type"]>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<RunCommand["status"]>().notNull(),
    error: text("error"),
    createdAt: dateColumn("created_at").notNull(),
    acknowledgedAt: dateColumn("acknowledged_at"),
  },
  (table) => [
    uniqueIndex("run_commands_run_actor_intent_idx").on(
      table.runId,
      table.requestedByUserId,
      table.idempotencyKey,
    ),
    index("run_commands_actor_idx").on(table.requestedByUserId),
    index("run_commands_run_status_idx").on(table.runId, table.status),
  ],
);
export const runEvents = pgTable(
  "run_events",
  {
    runId: requiredReference("run_id", () => taskAgentRuns.id, "cascade"),
    seq: integer("seq").notNull(),
    occurredAt: dateColumn("occurred_at").notNull(),
    type: text("type").$type<RunEvent["type"]>().notNull(),
    payload: jsonb("payload").$type<RunEvent["payload"]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.runId, table.seq] })],
);
export const runArtifacts = pgTable(
  "run_artifacts",
  {
    id: text("id").primaryKey(),
    runId: requiredReference("run_id", () => taskAgentRuns.id, "cascade"),
    assetVersionId: requiredReference("asset_version_id", () => v2AssetVersions.id, "restrict"),
    name: text("name").notNull(),
    createdAt: dateColumn("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("run_artifacts_run_version_idx").on(table.runId, table.assetVersionId),
    index("run_artifacts_version_idx").on(table.assetVersionId),
  ],
);
