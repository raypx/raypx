import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { dateColumn } from "./columns.js";
import { cloudColumns, cloudResourceTable } from "./cloud-columns.js";

export const cloudTaskStatusEnum = pgEnum("cloud_task_status", [
  "open",
  "in_progress",
  "waiting_input",
  "review",
  "completed",
  "cancelled",
]);
export const cloudRunStatusEnum = pgEnum("cloud_run_status", [
  "queued",
  "running",
  "needs_input",
  "succeeded",
  "failed",
  "cancelled",
]);
export const cloudUsageStateEnum = pgEnum("cloud_usage_state", [
  "reserved",
  "started",
  "settled",
  "unknown",
  "released",
]);
export const cloudToolStatusEnum = pgEnum("cloud_tool_status", [
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const cloudCommandStatusEnum = pgEnum("cloud_command_status", [
  "pending",
  "applied",
  "rejected",
]);
export const cloudMutations = cloudResourceTable("cloud_mutations");
export const cloudConversations = cloudResourceTable("cloud_conversations");
export const cloudTurns = cloudResourceTable("cloud_turns");
export const cloudSpendingGrants = cloudResourceTable("cloud_spending_grants");
export const cloudMessages = cloudResourceTable("cloud_messages");
export const cloudExecutionGrants = cloudResourceTable("cloud_execution_grants");
export const cloudTasks = pgTable(
  "cloud_tasks",
  {
    ...cloudColumns(),
    status: cloudTaskStatusEnum("status").notNull(),
    currentRoundId: text("current_round_id").notNull(),
    goalVersion: integer("goal_version").notNull(),
  },
  (t) => [
    index("cloud_tasks_scope_idx").on(t.scopeType, t.ownerUserId, t.projectId, t.createdAt, t.id),
    uniqueIndex("cloud_tasks_actor_intent_idx").on(t.actorId, t.idempotencyKey),
  ],
);
export const cloudTaskRounds = pgTable(
  "cloud_task_rounds",
  {
    ...cloudColumns(),
    taskId: text("task_id")
      .notNull()
      .references(() => cloudTasks.id, { onDelete: "restrict" }),
    goalVersion: integer("goal_version").notNull(),
  },
  (t) => [
    uniqueIndex("cloud_task_rounds_task_version_idx").on(t.taskId, t.goalVersion),
    uniqueIndex("cloud_task_rounds_actor_intent_idx").on(t.actorId, t.idempotencyKey),
    index("cloud_task_rounds_parent_idx").on(t.parentId),
  ],
);
export const cloudRuns = pgTable(
  "cloud_runs",
  {
    ...cloudColumns(),
    taskId: text("task_id").references(() => cloudTasks.id, { onDelete: "restrict" }),
    roundId: text("round_id").references(() => cloudTaskRounds.id, { onDelete: "restrict" }),
    ownerAccountId: text("owner_account_id").notNull(),
    leaseExpiresAt: dateColumn("lease_expires_at"),
    cancelRequested: boolean("cancel_requested").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => cloudConversations.id, { onDelete: "restrict" }),
    status: cloudRunStatusEnum("status").notNull(),
    dispatchReady: boolean("dispatch_ready").notNull(),
    ownerId: text("owner_id"),
    epoch: integer("epoch").notNull(),
  },
  (t) => [
    uniqueIndex("cloud_runs_actor_intent_idx").on(t.actorId, t.idempotencyKey),
    uniqueIndex("cloud_runs_active_task_idx")
      .on(t.taskId)
      .where(sql`${t.status} IN ('queued','running')`),
    index("cloud_runs_dispatch_idx").on(t.status, t.dispatchReady, t.createdAt),
    index("cloud_runs_conversation_idx").on(t.conversationId, t.createdAt, t.id),
    index("cloud_runs_owner_idx").on(t.ownerId),
    index("cloud_runs_owner_account_idx").on(t.ownerAccountId, t.status),
    index("cloud_runs_round_idx").on(t.roundId),
    index("cloud_runs_expired_lease_idx").on(t.status, t.leaseExpiresAt),
    index("cloud_runs_actor_idx").on(t.actorId),
    index("cloud_runs_task_idx").on(t.taskId),
  ],
);
export const cloudExecutions = cloudResourceTable("cloud_executions");
export const cloudTools = cloudResourceTable("cloud_tools");
export const cloudSources = cloudResourceTable("cloud_sources");
export const cloudAssets = cloudResourceTable("cloud_assets");
export const cloudRevisions = pgTable(
  "cloud_revisions",
  {
    ...cloudColumns(),
    roundId: text("round_id")
      .notNull()
      .references(() => cloudTaskRounds.id, { onDelete: "restrict" }),
    goalVersion: integer("goal_version").notNull(),
  },
  (t) => [
    index("cloud_revisions_parent_idx").on(t.parentId),
    index("cloud_revisions_round_idx").on(t.roundId),
  ],
);
export const cloudUsageCalls = pgTable(
  "cloud_usage_calls",
  {
    ...cloudColumns(),
    runId: text("run_id")
      .notNull()
      .references(() => cloudRuns.id, { onDelete: "restrict" }),
    state: cloudUsageStateEnum("state").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    roundId: text("round_id").references(() => cloudTaskRounds.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("cloud_usage_calls_actor_state_idx").on(t.actorId, t.state),
    index("cloud_usage_calls_run_idx").on(t.runId),
    index("cloud_usage_calls_account_state_idx").on(t.ownerAccountId, t.state),
    index("cloud_usage_calls_round_state_idx").on(t.roundId, t.state),
  ],
);
export const cloudCommands = cloudResourceTable("cloud_commands");
export const cloudEvents = pgTable(
  "cloud_events",
  {
    runId: text("run_id")
      .notNull()
      .references(() => cloudRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventId: text("event_id").notNull(),
    occurredAt: dateColumn("occurred_at").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.sequence] }),
    uniqueIndex("cloud_events_run_event_idx").on(t.runId, t.eventId),
  ],
);
