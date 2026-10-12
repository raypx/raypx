import { dateColumn, createdAt, timestamps, requiredReference } from "./columns.js";
import { boolean, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./identity.js";
import {
  workspaceMembershipRoleEnum,
  workspaceMembershipStatusEnum,
  projectStageEnum,
  projectTaskStatusEnum,
  projectMemberRoleEnum,
  projectMemberStatusEnum,
  reviewStatusEnum,
  feedbackStatusEnum,
  activityTypeEnum,
  agentRunStatusEnum,
  scheduledTaskStatusEnum,
} from "./enums.js";
import { agentRuns } from "./legacy-assets.js";

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: requiredReference("user_id", () => users.id, "cascade"),
    role: workspaceMembershipRoleEnum("role").notNull().default("viewer"),
    status: workspaceMembershipStatusEnum("status").notNull().default("active"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("workspace_memberships_workspace_user_idx").on(table.workspaceId, table.userId),
    index("workspace_memberships_user_id_idx").on(table.userId),
    index("workspace_memberships_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    ownerId: requiredReference("owner_id", () => users.id, "restrict"),
    title: text("title").notNull(),
    description: text("description"),
    stage: projectStageEnum("stage").notNull().default("draft"),
    archived: boolean("archived").notNull().default(false),
    archivedAt: dateColumn("archived_at"),
    previousStage: projectStageEnum("previous_stage"),
    deadline: dateColumn("deadline"),
    cover: text("cover"),
    thumbnail: text("thumbnail"),
    ...timestamps(),
  },
  (table) => [
    index("projects_workspace_id_updated_at_idx").on(table.workspaceId, table.updatedAt),
    index("projects_owner_id_idx").on(table.ownerId),
    index("projects_stage_archived_idx").on(table.stage, table.archived),
  ],
);

export const projectTasks = pgTable(
  "project_tasks",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => projects.id, "cascade"),
    title: text("title").notNull(),
    status: projectTaskStatusEnum("status").notNull().default("todo"),
    createdBy: requiredReference("created_by", () => users.id, "restrict"),
    ...timestamps(),
  },
  (table) => [
    index("project_tasks_project_id_updated_at_idx").on(table.projectId, table.updatedAt),
    index("project_tasks_project_id_status_idx").on(table.projectId, table.status),
    index("project_tasks_created_by_idx").on(table.createdBy),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => projects.id, "cascade"),
    workspaceId: text("workspace_id").notNull(),
    userId: requiredReference("user_id", () => users.id, "cascade"),
    role: projectMemberRoleEnum("role").notNull(),
    status: projectMemberStatusEnum("status").notNull().default("active"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("project_members_project_id_user_id_idx").on(table.projectId, table.userId),
    index("project_members_project_id_status_idx").on(table.projectId, table.status),
    index("project_members_workspace_id_user_id_idx").on(table.workspaceId, table.userId),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => projects.id, "cascade"),
    workspaceId: text("workspace_id").notNull(),
    targetVersionId: text("target_version_id"),
    status: reviewStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    requestedBy: requiredReference("requested_by", () => users.id, "restrict"),
    ...timestamps(),
    resolvedAt: dateColumn("resolved_at"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("reviews_project_id_updated_at_idx").on(table.projectId, table.updatedAt),
    index("reviews_project_id_status_idx").on(table.projectId, table.status),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    reviewId: requiredReference("review_id", () => reviews.id, "cascade"),
    projectId: requiredReference("project_id", () => projects.id, "cascade"),
    targetVersionId: text("target_version_id").notNull(),
    authorId: requiredReference("author_id", () => users.id, "restrict"),
    body: text("body").notNull(),
    status: feedbackStatusEnum("status").notNull().default("open"),
    ...timestamps(),
    resolvedAt: dateColumn("resolved_at"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("feedback_review_id_created_at_idx").on(table.reviewId, table.createdAt),
    index("feedback_project_id_idx").on(table.projectId),
    index("feedback_author_id_idx").on(table.authorId),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey(),
    type: activityTypeEnum("type").notNull(),
    accountId: text("account_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actorId: requiredReference("actor_id", () => users.id, "restrict"),
    targetId: text("target_id"),
    summary: text("summary").notNull(),
    occurredAt: dateColumn("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    index("activities_account_id_occurred_at_idx").on(table.accountId, table.occurredAt),
    index("activities_project_id_occurred_at_idx").on(table.projectId, table.occurredAt),
    index("activities_workspace_id_occurred_at_idx").on(table.workspaceId, table.occurredAt),
  ],
);

export const piSessions = pgTable(
  "pi_sessions",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => projects.id, "cascade"),
    workspaceId: text("workspace_id").notNull(),
    agentRunId: requiredReference("agent_run_id", () => agentRuns.id, "restrict"),
    requestedBy: requiredReference("requested_by", () => users.id, "restrict"),
    prompt: text("prompt").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull(),
    status: agentRunStatusEnum("status").notNull(),
    ...timestamps(),
    completedAt: dateColumn("completed_at"),
  },
  (table) => [
    uniqueIndex("pi_sessions_agent_run_id_idx").on(table.agentRunId),
    index("pi_sessions_project_id_updated_at_idx").on(table.projectId, table.updatedAt),
  ],
);

export const piSessionEvents = pgTable(
  "pi_session_events",
  {
    id: text("id").primaryKey(),
    sessionId: requiredReference("session_id", () => piSessions.id, "cascade"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("pi_session_events_session_created_idx").on(table.sessionId, table.createdAt)],
);

export const scheduledTasks = pgTable(
  "scheduled_tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    createdBy: requiredReference("created_by", () => users.id, "restrict"),
    name: text("name").notNull(),
    instruction: text("instruction").notNull(),
    schedule: text("schedule").notNull(),
    status: scheduledTaskStatusEnum("status").notNull().default("active"),
    executionStatus: text("execution_status").notNull().default("unavailable"),
    nextRunAt: dateColumn("next_run_at"),
    ...timestamps(),
  },
  (table) => [
    index("scheduled_tasks_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
  ],
);
