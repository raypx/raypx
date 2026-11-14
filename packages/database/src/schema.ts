import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  integer,
  jsonb,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { defineRelations, sql, type SQL } from "drizzle-orm";
import { oauthTables } from "./oauth-schema.js";

const date = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const timestamps = () => ({
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow(),
});
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("member"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: date("ban_expires"),
    twoFactorEnabled: boolean("two_factor_enabled").default(false),
    ...timestamps(),
  },
  (table) => [index("user_created_at_idx").on(table.createdAt)],
);
export const spaces = pgTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Durable first-use marker: joining/creating other Spaces cannot suppress the private one.
  privateFor: text("private_for")
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  deletionClaimedAt: date("deletion_claimed_at"),
  ...timestamps(),
});
export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    removedAt: date("removed_at"),
    removalReason: text("removal_reason", { enum: ["removed", "left"] }),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.accountId] }),
    index("space_members_account_idx").on(table.accountId, table.spaceId),
    check("space_members_role_check", sql`${table.role} in ('owner', 'member')`),
    check("space_members_removal_reason_check", sql`${table.removalReason} in ('removed', 'left')`),
  ],
);

// Historical actor IDs deliberately do not reference current memberships/accounts.
// Removing one must neither erase audit evidence nor revoke already accepted history.
export const spaceInvitations = pgTable(
  "space_invitations",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    tokenHash: text("token_hash").notNull(),
    inviterAccountId: text("inviter_account_id").notNull(),
    inviterName: text("inviter_name").notNull(),
    status: text("status", { enum: ["open", "expired", "cancelled", "consumed"] })
      .notNull()
      .default("open"),
    consumedByAccountId: text("consumed_by_account_id"),
    consumedAt: date("consumed_at"),
    createdAt: date("created_at").notNull().defaultNow(),
    expiresAt: date("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    uniqueIndex("space_invitations_token_hash_idx").on(table.tokenHash),
    index("space_invitations_open_idx").on(table.spaceId, table.status, table.createdAt, table.id),
    check(
      "space_invitations_status_check",
      sql`${table.status} in ('open', 'expired', 'cancelled', 'consumed')`,
    ),
    foreignKey({
      columns: [table.spaceId, table.inviterAccountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.consumedByAccountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
  ],
);
export const spaceSettingsOverrides = pgTable(
  "space_settings_overrides",
  {
    spaceId: text("space_id")
      .primaryKey()
      .references(() => spaces.id, { onDelete: "cascade" }),
    approvalMode: text("approval_mode", { enum: ["ask", "never", "auto"] }).notNull(),
    updatedByAccountId: text("updated_by_account_id").notNull(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "space_settings_overrides_mode_check",
      sql`${table.approvalMode} in ('ask', 'never', 'auto')`,
    ),
  ],
);
export const spaceAudit = pgTable(
  "space_audit",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    operationId: text("operation_id").notNull(),
    actorAccountId: text("actor_account_id").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    outcome: text("outcome", { enum: ["pending", "succeeded", "refused", "failed"] }).notNull(),
    code: text("code"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    index("space_audit_cursor_idx").on(table.spaceId, table.createdAt, table.id),
    index("space_audit_operation_idx").on(table.spaceId, table.operationId),
    check(
      "space_audit_outcome_check",
      sql`${table.outcome} in ('pending', 'succeeded', 'refused', 'failed')`,
    ),
  ],
);
export const spaceEvents = pgTable(
  "space_events",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity(),
    kind: text("kind", {
      enum: [
        "space.member.joined",
        "space.member.removed",
        "space.member.role_changed",
        "space.renamed",
        "page.created",
        "page.updated",
        "page.deleted",
      ],
    }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    subjectAccountId: text("subject_account_id").generatedAlwaysAs(sql`payload ->> 'accountId'`),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    check(
      "space_events_kind_check",
      sql`${table.kind} in ('space.member.joined', 'space.member.removed', 'space.member.role_changed', 'space.renamed', 'page.created', 'page.updated', 'page.deleted')`,
    ),
    foreignKey({
      columns: [table.spaceId, table.subjectAccountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
  ],
);
export const spaceDeletionJobs = pgTable(
  "space_deletion_jobs",
  {
    spaceId: text("space_id")
      .primaryKey()
      .references(() => spaces.id, { onDelete: "cascade" }),
    requestedByAccountId: text("requested_by_account_id").notNull(),
    stage: text("stage", {
      enum: ["claimed", "runs_cancelled", "computers_released", "objects_removed"],
    })
      .notNull()
      .default("claimed"),
    leaseOwner: text("lease_owner"),
    leaseUntil: date("lease_until"),
    fence: bigint("fence", { mode: "number" }).notNull().default(0),
    claimedAt: date("claimed_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "space_deletion_jobs_stage_check",
      sql`${table.stage} in ('claimed', 'runs_cancelled', 'computers_released', 'objects_removed')`,
    ),
    check(
      "space_deletion_jobs_lease_check",
      sql`(${table.leaseOwner} is null) = (${table.leaseUntil} is null)`,
    ),
  ],
);
export const agents = pgTable(
  "agents",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    modelId: text("model_id").notNull(),
    allowSharedMemory: boolean("allow_shared_memory").notNull().default(false),
    allowCrossSpaceMessages: boolean("allow_cross_space_messages").notNull().default(false),
    deletedAt: date("deleted_at"),
    ...timestamps(),
  },
  (table) => [primaryKey({ columns: [table.spaceId, table.id] })],
);
export const computers = pgTable(
  "computers",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    scope: text("scope", { enum: ["team", "private", "device"] }).notNull(),
    agentId: text("agent_id"),
    createdByAccountId: text("created_by_account_id").notNull(),
    provider: text("provider", { enum: ["memory", "sandbox", "device"] }).notNull(),
    state: text("state", {
      enum: ["stopped", "starting", "running", "stopping", "failed", "destroyed"],
    })
      .notNull()
      .default("stopped"),
    generation: bigint("generation", { mode: "number" }).notNull().default(1),
    homeRevision: text("home_revision"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: date("lease_expires_at"),
    leaseFence: bigint("lease_fence", { mode: "number" }).notNull().default(0),
    failureCode: text("failure_code", { enum: ["PROVIDER_UNAVAILABLE", "RESTORE_FAILED"] }),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.id] }),
    uniqueIndex("computers_team_idx")
      .on(t.spaceId)
      .where(sql`${t.scope} = 'team'`),
    uniqueIndex("computers_private_agent_idx")
      .on(t.spaceId, t.agentId)
      .where(sql`${t.scope} = 'private'`),
    index("computers_creator_idx").on(t.createdByAccountId),
    foreignKey({
      columns: [t.spaceId, t.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.createdByAccountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    check(
      "computers_scope_check",
      sql`(${t.scope} = 'team' and ${t.agentId} is null) or (${t.scope} = 'private' and ${t.agentId} is not null) or (${t.scope} = 'device' and ${t.agentId} is null)`,
    ),
    check("computers_provider_check", sql`${t.provider} in ('memory', 'sandbox', 'device')`),
    check(
      "computers_state_check",
      sql`${t.state} in ('stopped', 'starting', 'running', 'stopping', 'failed', 'destroyed')`,
    ),
    check(
      "computers_generation_check",
      sql`${t.generation} > 0 and ${t.generation} <= 9007199254740991 and ${t.leaseFence} >= 0 and ${t.leaseFence} <= 9007199254740991`,
    ),
    check(
      "computers_revision_check",
      sql`${t.homeRevision} is null or ${t.homeRevision} ~ '^[a-f0-9]{64}$'`,
    ),
    check("computers_lease_check", sql`(${t.leaseOwner} is null) = (${t.leaseExpiresAt} is null)`),
    check(
      "computers_failure_check",
      sql`(${t.state} = 'failed' and ${t.failureCode} is not null and ${t.failureCode} in ('PROVIDER_UNAVAILABLE', 'RESTORE_FAILED')) or (${t.state} <> 'failed' and ${t.failureCode} is null)`,
    ),
  ],
);
/** A short-lived, cross-process registration for an authenticated screen stream. */
export const computerScreenViewers = pgTable(
  "computer_screen_viewers",
  {
    spaceId: text("space_id").notNull(),
    computerId: text("computer_id").notNull(),
    generation: bigint("generation", { mode: "number" }).notNull(),
    viewerId: text("viewer_id").notNull(),
    accountId: text("account_id").notNull(),
    expiresAt: date("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.computerId, table.viewerId] }),
    index("computer_screen_viewers_member_idx").on(table.spaceId, table.accountId),
    foreignKey({
      columns: [table.spaceId, table.computerId],
      foreignColumns: [computers.spaceId, computers.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    check(
      "computer_screen_viewers_generation_check",
      sql`${table.generation} > 0 and ${table.generation} <= 9007199254740991`,
    ),
  ],
);
/** One expiring input owner per Space computer; no input or screen bytes persist here. */
export const computerScreenControls = pgTable(
  "computer_screen_controls",
  {
    spaceId: text("space_id").notNull(),
    computerId: text("computer_id").notNull(),
    generation: bigint("generation", { mode: "number" }).notNull(),
    id: text("id").notNull(),
    accountId: text("account_id").notNull(),
    viewerId: text("viewer_id").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
    expiresAt: date("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.computerId] }),
    uniqueIndex("computer_screen_controls_id_idx").on(table.spaceId, table.id),
    index("computer_screen_controls_member_idx").on(table.spaceId, table.accountId),
    foreignKey({
      columns: [table.spaceId, table.computerId],
      foreignColumns: [computers.spaceId, computers.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    check(
      "computer_screen_controls_generation_check",
      sql`${table.generation} > 0 and ${table.generation} <= 9007199254740991`,
    ),
    check("computer_screen_controls_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
export const conversations = pgTable(
  "conversations",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    agentId: text("agent_id").notNull(),
    kind: text("kind", { enum: ["direct", "group"] }).notNull(),
    name: text("name"),
    defaultResponderAgentId: text("default_responder_agent_id"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    uniqueIndex("conversations_direct_agent_idx")
      .on(table.spaceId, table.agentId)
      .where(sql`${table.kind} = 'direct'`),
    foreignKey({
      columns: [table.spaceId, table.defaultResponderAgentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    check("conversations_kind_check", sql`${table.kind} in ('direct', 'group')`),
    check(
      "conversations_group_name_check",
      sql`${table.kind} <> 'group' or ${table.name} is not null`,
    ),
  ],
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    agentId: text("agent_id").notNull(),
    removedAt: date("removed_at"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.conversationId, t.agentId] }),
    index("conversation_participants_agent_idx").on(t.spaceId, t.agentId),
    foreignKey({
      columns: [t.spaceId, t.conversationId],
      foreignColumns: [conversations.spaceId, conversations.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
  ],
);

// Transactional counters, never PostgreSQL sequences: rollback consumes no number.
export const conversationCounters = pgTable(
  "conversation_counters",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull().default(0),
    retainedAfter: bigint("retained_after", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId] }),
    foreignKey({
      columns: [table.spaceId, table.conversationId],
      foreignColumns: [conversations.spaceId, conversations.id],
    }).onDelete("cascade"),
    check(
      "conversation_counters_bounds",
      sql`${table.retainedAfter} >= 0 and ${table.retainedAfter} <= ${table.sequence} and ${table.sequence} <= 9007199254740991`,
    ),
  ],
);
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    id: text("id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    // Historical attribution must not delete a middle section of the event stream.
    authorAccountId: text("author_account_id").notNull(),
    authorAgentId: text("author_agent_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    text: text("text").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.id] }),
    foreignKey({
      columns: [table.spaceId, table.authorAgentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    uniqueIndex("conversation_messages_sequence_idx").on(
      table.spaceId,
      table.conversationId,
      table.sequence,
    ),
    uniqueIndex("conversation_messages_event_ref_idx").on(
      table.spaceId,
      table.conversationId,
      table.id,
      table.sequence,
    ),
    uniqueIndex("conversation_messages_idempotency_idx").on(
      table.spaceId,
      table.conversationId,
      table.authorAccountId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.spaceId, table.conversationId],
      foreignColumns: [conversations.spaceId, conversations.id],
    }).onDelete("cascade"),
    check(
      "conversation_messages_sequence_check",
      sql`${table.sequence} > 0 and ${table.sequence} <= 9007199254740991`,
    ),
  ],
);
/** Historical display names grant no membership and survive account removal. */
export const conversationMemberNames = pgTable(
  "conversation_member_names",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    accountId: text("account_id").notNull(),
    displayName: text("display_name").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.conversationId, t.accountId] }),
    foreignKey({
      columns: [t.spaceId, t.conversationId],
      foreignColumns: [conversations.spaceId, conversations.id],
    }).onDelete("cascade"),
    check("conversation_member_names_bounds", sql`length(${t.displayName}) <= 200`),
  ],
);
export const conversationMessageMentions = pgTable(
  "conversation_message_mentions",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    messageId: text("message_id").notNull(),
    agentId: text("agent_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.conversationId, t.messageId, t.agentId] }),
    foreignKey({
      columns: [t.spaceId, t.conversationId, t.messageId],
      foreignColumns: [
        conversationMessages.spaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
  ],
);
export const conversationRuns = pgTable(
  "conversation_runs",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    id: text("id").notNull(),
    agentId: text("agent_id").notNull(),
    trigger: text("trigger").notNull().default("message"),
    parentRunId: text("parent_run_id"),
    delegationDepth: integer("delegation_depth").notNull().default(0),
    delegationTask: text("delegation_task"),
    delegatedAllowSharedMemory: boolean("delegated_allow_shared_memory"),
    instructionRevision: integer("instruction_revision").notNull().default(0),
    computerHeld: boolean("computer_held").notNull().default(false),
    computerInputPaused: boolean("computer_input_paused").notNull().default(false),
    originMessageId: text("origin_message_id"),
    agentChainDepth: integer("agent_chain_depth").notNull().default(0),
    untrustedInput: boolean("untrusted_input").notNull().default(false),
    // Stable identity rows outlive the active routine definition.
    routineId: text("routine_id"),
    routineDueAt: date("routine_due_at"),
    routineTimezone: text("routine_timezone"),
    inboundContent: text("inbound_content"),
    inboundProvenance: jsonb("inbound_provenance").$type<{
      kind: "webhook" | "email" | "repository";
      routineId: string;
      deliveryId: string;
    }>(),
    inboundRoutineId: text("inbound_routine_id").generatedAlwaysAs(
      sql`inbound_provenance ->> 'routineId'`,
    ),
    messageId: text("message_id").notNull(),
    messageSequence: bigint("message_sequence", { mode: "number" }).notNull(),
    // Historical actor identity survives removal of the current Space membership.
    memberAccountId: text("member_account_id").notNull(),
    modelId: text("model_id").notNull(),
    instructions: text("instructions").notNull(),
    state: text("state", {
      enum: ["queued", "running", "waiting", "succeeded", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    failureCode: text("failure_code"),
    createdAt: date("created_at").notNull().defaultNow(),
    startedAt: date("started_at"),
    firstResponseAt: date("first_response_at"),
    finishedAt: date("finished_at"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: date("lease_expires_at"),
    fence: bigint("fence", { mode: "number" }).notNull().default(0),
    nextAttemptAt: date("next_attempt_at").notNull().defaultNow(),
    attemptCount: integer("attempt_count").notNull().default(0),
    connectionId: text("connection_id"),
    // Historical selectors survive resource removal, so a resume can fail explicitly.
    computerId: text("computer_id"),
    computerGeneration: integer("computer_generation"),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.id] }),
    uniqueIndex("conversation_runs_message_idx")
      .on(table.spaceId, table.conversationId, table.messageId, table.agentId)
      .where(sql`${table.parentRunId} is null`),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.parentRunId],
      foreignColumns: [table.spaceId, table.conversationId, table.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.originMessageId],
      foreignColumns: [
        conversationMessages.spaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
      ],
    }).onDelete("cascade"),
    uniqueIndex("conversation_runs_actor_idx").on(
      table.spaceId,
      table.conversationId,
      table.id,
      table.memberAccountId,
    ),
    uniqueIndex("conversation_runs_active_agent_idx")
      .on(table.spaceId, table.agentId)
      .where(sql`${table.state} in ('running', 'waiting') and ${table.parentRunId} is null`),
    index("conversation_runs_active_window_idx")
      .on(table.spaceId, table.conversationId, table.messageSequence, table.id)
      .where(sql`${table.state} in ('queued', 'running', 'waiting')`),
    index("conversation_runs_routine_idx").on(table.spaceId, table.routineId),
    index("conversation_runs_inbound_routine_idx").on(table.spaceId, table.inboundRoutineId),
    index("conversation_runs_queue_idx").on(
      table.spaceId,
      table.conversationId,
      table.state,
      table.messageSequence,
    ),
    index("conversation_runs_history_idx").on(
      table.spaceId,
      table.conversationId,
      table.messageSequence,
      table.id,
    ),
    index("conversation_runs_recovery_idx")
      .on(table.nextAttemptAt, table.leaseExpiresAt)
      .where(sql`${table.state} in ('queued', 'running', 'waiting')`),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.routineId],
      foreignColumns: [routineIdentities.spaceId, routineIdentities.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.inboundRoutineId],
      foreignColumns: [routineIdentities.spaceId, routineIdentities.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.messageId, table.messageSequence],
      foreignColumns: [
        conversationMessages.spaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
        conversationMessages.sequence,
      ],
    }).onDelete("cascade"),
    check(
      "conversation_runs_state_check",
      sql`${table.state} in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "conversation_runs_trigger_check",
      sql`${table.trigger} in ('message', 'routine', 'webhook', 'email', 'agent')`,
    ),
    check(
      "conversation_runs_lease_check",
      sql`(${table.leaseOwner} is null) = (${table.leaseExpiresAt} is null)`,
    ),
    check("conversation_runs_fence_check", sql`${table.fence} >= 0 and ${table.attemptCount} >= 0`),
    check(
      "conversation_runs_computer_pin_check",
      sql`(${table.computerId} is null) = (${table.computerGeneration} is null)`,
    ),
    check(
      "conversation_runs_inbound_routine_check",
      sql`${table.inboundProvenance} is null or (${table.inboundRoutineId} is not null and ${table.routineId} is not null and ${table.inboundRoutineId} = ${table.routineId})`,
    ),
  ],
);
export const conversationRunAttempts = pgTable(
  "conversation_run_attempts",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    ownerId: text("owner_id").notNull(),
    fence: bigint("fence", { mode: "number" }).notNull(),
    number: integer("number").notNull(),
    state: text("state", {
      enum: ["running", "succeeded", "failed", "cancelled", "released", "abandoned"],
    })
      .notNull()
      .default("running"),
    failureCode: text("failure_code"),
    startedAt: date("started_at").notNull().defaultNow(),
    timeoutAt: date("timeout_at").notNull(),
    finishedAt: date("finished_at"),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.runId, table.id] }),
    uniqueIndex("conversation_run_attempts_fence_idx").on(
      table.spaceId,
      table.conversationId,
      table.runId,
      table.fence,
    ),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    check(
      "conversation_run_attempts_state_check",
      sql`${table.state} in ('running', 'succeeded', 'failed', 'cancelled', 'released', 'abandoned')`,
    ),
    check(
      "conversation_run_attempts_bounds_check",
      sql`${table.fence} > 0 and ${table.number} > 0 and ${table.timeoutAt} > ${table.startedAt}`,
    ),
  ],
);
export const conversationRunCheckpoints = pgTable(
  "conversation_run_checkpoints",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    attemptId: text("attempt_id").notNull(),
    fence: bigint("fence", { mode: "number" }).notNull(),
    revision: integer("revision").notNull().default(0),
    history: jsonb("history").notNull(),
    data: jsonb("data").notNull(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.runId] }),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId, table.attemptId],
      foreignColumns: [
        conversationRunAttempts.spaceId,
        conversationRunAttempts.conversationId,
        conversationRunAttempts.runId,
        conversationRunAttempts.id,
      ],
    }).onDelete("cascade"),
    check(
      "conversation_run_checkpoints_memory_refs_check",
      sql`not coalesce((${table.data}->'memory') ? 'revisions', false)`,
    ),
    check(
      "conversation_run_checkpoints_data_check",
      sql`jsonb_typeof(${table.history}) = 'array' and jsonb_typeof(${table.data}) = 'object' and ${table.fence} > 0 and ${table.revision} >= 0`,
    ),
  ],
);
export const conversationDelegations = pgTable(
  "conversation_delegations",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    parentRunId: text("parent_run_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    childRunId: text("child_run_id").notNull(),
    instructionRevision: integer("instruction_revision").notNull().default(0),
    fence: bigint("fence", { mode: "number" }).notNull().default(0),
    state: text("state", { enum: ["pending", "ready", "delivered", "discarded"] })
      .notNull()
      .default("pending"),
    result: jsonb("result"),
    createdAt: date("created_at").notNull().defaultNow(),
    completedAt: date("completed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.parentRunId, t.toolCallId] }),
    uniqueIndex("conversation_delegations_child_idx").on(t.spaceId, t.conversationId, t.childRunId),
    foreignKey({
      columns: [t.spaceId, t.conversationId, t.parentRunId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.conversationId, t.childRunId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    check(
      "conversation_delegations_state_check",
      sql`${t.state} in ('pending', 'ready', 'delivered', 'discarded')`,
    ),
  ],
);

export const conversationRunSteering = pgTable(
  "conversation_run_steering",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    messageId: text("message_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    consumedFence: bigint("consumed_fence", { mode: "number" }),
    consumedAt: date("consumed_at"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.runId, table.messageId] }),
    index("conversation_run_steering_pending_idx")
      .on(table.spaceId, table.conversationId, table.runId, table.sequence)
      .where(sql`${table.consumedAt} is null`),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.messageId, table.sequence],
      foreignColumns: [
        conversationMessages.spaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
        conversationMessages.sequence,
      ],
    }).onDelete("cascade"),
    check(
      "conversation_run_steering_consumed_check",
      sql`(${table.consumedAt} is null) = (${table.consumedFence} is null)`,
    ),
  ],
);
export const conversationRunBackupJobs = pgTable(
  "conversation_run_backup_jobs",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    runAt: date("run_at").notNull(),
    lockedBy: text("locked_by"),
    lockedUntil: date("locked_until"),
    deliveries: integer("deliveries").notNull().default(0),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.runId] }),
    index("conversation_run_backup_jobs_due_idx").on(table.runAt, table.lockedUntil),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    check(
      "conversation_run_backup_jobs_lock_check",
      sql`(${table.lockedBy} is null) = (${table.lockedUntil} is null)`,
    ),
  ],
);
export const conversationReplySegments = pgTable(
  "conversation_reply_segments",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    id: text("id").notNull(),
    runId: text("run_id").notNull(),
    fence: bigint("fence", { mode: "number" }).notNull().default(0),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    text: text("text").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.id] }),
    index("conversation_reply_segments_run_idx").on(
      table.spaceId,
      table.conversationId,
      table.runId,
      table.sequence.desc(),
    ),
    uniqueIndex("conversation_reply_segments_sequence_idx").on(
      table.spaceId,
      table.conversationId,
      table.sequence,
    ),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
  ],
);

export const approvalSettings = pgTable(
  "approval_settings",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["ask", "never", "auto"] }).notNull(),
    revision: integer("revision").notNull().default(0),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("approval_settings_mode_check", sql`${table.mode} in ('ask', 'never', 'auto')`),
  ],
);
export const modelConnections = pgTable(
  "model_connections",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: ["anthropic", "openai", "google", "openrouter", "compatible"],
    }).notNull(),
    baseUrl: text("base_url"),
    api: text("api", { enum: ["anthropic-messages", "openai-completions", "openai-responses"] }),
    models: jsonb("models").$type<string[]>().notNull(),
    availability: text("availability", { enum: ["all", "selected"] }).notNull(),
    secretId: text("secret_id").notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("model_connections_secret_owner_idx").on(table.id, table.accountId, table.secretId),
    unique("model_connections_owner_idx").on(table.id, table.accountId),
    index("model_connections_account_idx").on(table.accountId, table.createdAt, table.id),
    check(
      "model_connections_kind_check",
      sql`${table.kind} in ('anthropic', 'openai', 'google', 'openrouter', 'compatible')`,
    ),
    check(
      "model_connections_availability_check",
      sql`${table.availability} in ('all', 'selected')`,
    ),
    check(
      "model_connections_protocol_check",
      sql`(${table.kind} = 'compatible' and ${table.baseUrl} is not null and ${table.api} in ('anthropic-messages', 'openai-completions', 'openai-responses')) or (${table.kind} <> 'compatible' and ${table.baseUrl} is null and ${table.api} is null)`,
    ),
  ],
);
// The secret is a child of its connection, so direct connection/account deletion erases it too.
export const modelConnectionSecrets = pgTable(
  "model_connection_secrets",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    accountId: text("account_id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    wrappedDataKey: text("wrapped_data_key").notNull(),
    keyId: text("key_id").notNull(),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.connectionId, table.accountId, table.id],
      foreignColumns: [modelConnections.id, modelConnections.accountId, modelConnections.secretId],
    }).onDelete("cascade"),
    index("model_connection_secrets_owner_idx").on(table.accountId, table.connectionId),
  ],
);
export const modelConnectionSpaces = pgTable(
  "model_connection_spaces",
  {
    connectionId: text("connection_id").notNull(),
    accountId: text("account_id").notNull(),
    spaceId: text("space_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.spaceId] }),
    foreignKey({
      columns: [table.connectionId, table.accountId],
      foreignColumns: [modelConnections.id, modelConnections.accountId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    index("model_connection_spaces_member_idx").on(
      table.spaceId,
      table.accountId,
      table.connectionId,
    ),
  ],
);
/** Body-free historical identity retained when a Page and its versions are deleted. */
export const pageIdentities = pgTable(
  "page_identities",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.spaceId, table.id] })],
);
export const conversationToolCalls = pgTable(
  "conversation_tool_calls",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    target: text("target").notNull(),
    argumentSummary: text("argument_summary").notNull(),
    startedAt: date("started_at").notNull().defaultNow(),
    finishedAt: date("finished_at"),
    outcome: text("outcome", { enum: ["succeeded", "failed", "refused", "cancelled", "unknown"] }),
    durationMs: integer("duration_ms"),
    exitStatus: integer("exit_status"),
    pageId: text("page_id"),
    pageVersion: integer("page_version"),
    fence: bigint("fence", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.runId, table.toolCallId] }),
    foreignKey({
      columns: [table.spaceId, table.pageId],
      foreignColumns: [pageIdentities.spaceId, pageIdentities.id],
    }).onDelete("cascade"),
    check(
      "conversation_tool_calls_page_check",
      sql`(${table.pageId} is null and ${table.pageVersion} is null) or (${table.pageId} is not null and ${table.pageVersion} is not null and ${table.pageVersion} > 0 and ${table.finishedAt} is not null and ${table.outcome} = 'succeeded' and ${table.toolName} in ('agent_page_create', 'agent_page_update'))`,
    ),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    index("conversation_tool_calls_snapshot_idx").on(
      table.spaceId,
      table.conversationId,
      table.startedAt,
      table.runId,
      table.toolCallId,
    ),
  ],
);
export const approvalRules = pgTable(
  "approval_rules",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    executable: text("executable"),
    decision: text("decision", { enum: ["allow", "block"] }).notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("approval_rules_action_idx")
      .on(table.accountId, table.toolName, table.executable)
      .nullsNotDistinct(),
    check("approval_rules_decision_check", sql`${table.decision} in ('allow', 'block')`),
    check(
      "approval_rules_tool_check",
      sql`(${table.toolName} in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command', 'computer_screenshot', 'computer_pointer', 'computer_keyboard', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_page_read', 'agent_skill_load', 'agent_skill_save') or (${table.toolName} ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' or ${table.toolName} ~ '^openapi_[a-f0-9]{32}__[a-zA-Z0-9_-]{1,64}$') and length(${table.toolName}) <= 128)`,
    ),
    check(
      "approval_rules_executable_check",
      sql`(${table.toolName} = 'computer_run_command' and ${table.executable} is not null and length(${table.executable}) between 1 and 1024) or (${table.toolName} <> 'computer_run_command' and ${table.executable} is null)`,
    ),
  ],
);
export const approvalRequests = pgTable(
  "approval_requests",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    id: text("id").notNull(),
    runId: text("run_id").notNull(),
    fence: bigint("fence", { mode: "number" }).notNull().default(0),
    memberAccountId: text("member_account_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    arguments: jsonb("arguments").$type<Record<string, unknown>>().notNull(),
    argumentSummary: text("argument_summary").notNull(),
    device: jsonb("device").$type<{
      id: string;
      name: string;
      directory: string;
      command?: string;
    }>(),
    target: text("target").notNull(),
    state: text("state", { enum: ["pending", "approved", "denied", "expired", "cancelled"] })
      .notNull()
      .default("pending"),
    createdAt: date("created_at").notNull().defaultNow(),
    expiresAt: date("expires_at").notNull(),
    resolvedAt: date("resolved_at"),
    answeredByAccountId: text("answered_by_account_id"),
    review: jsonb("review").$type<Record<string, unknown>>(),
    reviewModelId: text("review_model_id"),
    reviewStartedAt: date("review_started_at"),
    reviewFence: bigint("review_fence", { mode: "number" }),
    reviewEffectKey: text("review_effect_key"),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.id] }),
    uniqueIndex("approval_requests_id_idx").on(table.spaceId, table.id),
    uniqueIndex("approval_requests_review_effect_idx").on(
      table.spaceId,
      table.conversationId,
      table.runId,
      table.id,
      table.reviewEffectKey,
    ),
    index("approval_requests_review_budget_idx")
      .on(table.spaceId, table.runId)
      .where(sql`${table.reviewStartedAt} is not null`),
    uniqueIndex("approval_requests_event_ref_idx").on(
      table.spaceId,
      table.conversationId,
      table.runId,
      table.id,
    ),
    index("approval_requests_call_idx").on(
      table.spaceId,
      table.conversationId,
      table.runId,
      table.toolCallId,
    ),
    index("approval_requests_resolved_idx")
      .on(table.spaceId, table.conversationId, table.resolvedAt.desc(), table.id.desc())
      .where(sql`${table.state} <> 'pending'`),
    index("approval_requests_pending_idx")
      .on(table.spaceId, table.memberAccountId, table.createdAt)
      .where(sql`${table.state} = 'pending'`),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId, table.memberAccountId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
        conversationRuns.memberAccountId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId, table.answeredByAccountId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
        conversationRuns.memberAccountId,
      ],
    }).onDelete("cascade"),
    check(
      "approval_requests_tool_check",
      sql`(${table.toolName} in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command', 'computer_screenshot', 'computer_pointer', 'computer_keyboard', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_page_read', 'agent_skill_load', 'agent_skill_save') or (${table.toolName} ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' or ${table.toolName} ~ '^openapi_[a-f0-9]{32}__[a-zA-Z0-9_-]{1,64}$') and length(${table.toolName}) <= 128)`,
    ),
    check(
      "approval_requests_state_check",
      sql`${table.state} in ('pending', 'approved', 'denied', 'expired', 'cancelled')`,
    ),
    check(
      "approval_requests_resolution_check",
      sql`(${table.state} = 'pending' and ${table.resolvedAt} is null and ${table.answeredByAccountId} is null) or (${table.state} in ('approved', 'denied') and ${table.resolvedAt} is not null and ((${table.answeredByAccountId} is not null and ${table.answeredByAccountId} = ${table.memberAccountId}) or (${table.answeredByAccountId} is null and ${table.review} is not null and ((${table.state} = 'approved' and ${table.review}->>'verdict' = 'approve') or (${table.state} = 'denied' and ${table.review}->>'verdict' = 'deny'))))) or (${table.state} in ('expired', 'cancelled') and ${table.resolvedAt} is not null and ${table.answeredByAccountId} is null)`,
    ),
    check(
      "approval_requests_review_check",
      sql`(${table.reviewStartedAt} is null and ${table.reviewModelId} is null and ${table.reviewFence} is null and ${table.reviewEffectKey} is null and ${table.review} is null) or (${table.reviewStartedAt} is not null and ${table.reviewModelId} is not null and ${table.reviewFence} is not null and ${table.reviewEffectKey} is not null and length(${table.reviewModelId}) between 1 and 256 and ${table.reviewFence} >= 0 and ${table.reviewEffectKey} ~ '^[a-f0-9]{64}$' and (${table.review} is null or (jsonb_typeof(${table.review}) = 'object' and ${table.review} ?& array['modelId', 'verdict', 'reason', 'startedAt', 'completedAt', 'durationMs', 'fence'] and jsonb_typeof(${table.review}->'modelId') = 'string' and ${table.review}->>'modelId' = ${table.reviewModelId} and ${table.review}->>'verdict' in ('approve', 'ask', 'deny') and jsonb_typeof(${table.review}->'reason') = 'string' and length(${table.review}->>'reason') between 1 and 256 and (${table.review}->>'fence')::numeric = ${table.reviewFence} and (${table.review}->>'durationMs')::numeric >= 0 and (${table.review}->>'startedAt')::timestamptz = ${table.reviewStartedAt} and (${table.review}->>'completedAt')::timestamptz >= ${table.reviewStartedAt})))`,
    ),
    check(
      "approval_requests_bounds_check",
      sql`length(${table.argumentSummary}) <= 1024 and length(${table.target}) between 1 and 1024 and jsonb_typeof(${table.arguments}) = 'object' and length(${table.arguments}::text) <= 262144 and ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);
export const conversationEffects = pgTable(
  "conversation_effects",
  {
    spaceId: text("space_id").notNull(),
    key: text("key").notNull(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    fence: bigint("fence", { mode: "number" }).notNull().default(0),
    approvalRequestId: text("approval_request_id"),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    argumentHash: text("argument_hash").notNull(),
    state: text("state", { enum: ["intent", "succeeded", "failed", "unknown"] })
      .notNull()
      .default("intent"),
    result: text("result"),
    createdAt: date("created_at").notNull().defaultNow(),
    completedAt: date("completed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.key] }),
    foreignKey({
      name: "conversation_effects_review_request_fk",
      columns: [
        table.spaceId,
        table.conversationId,
        table.runId,
        table.approvalRequestId,
        table.key,
      ],
      foreignColumns: [
        approvalRequests.spaceId,
        approvalRequests.conversationId,
        approvalRequests.runId,
        approvalRequests.id,
        approvalRequests.reviewEffectKey,
      ],
    }).onDelete("cascade"),
    index("conversation_effects_run_idx").on(table.spaceId, table.conversationId, table.runId),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    check(
      "conversation_effects_tool_check",
      sql`(${table.toolName} in ('computer_write_file', 'computer_run_command', 'computer_screenshot', 'computer_pointer', 'computer_keyboard', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_skill_save') or (${table.toolName} ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' or ${table.toolName} ~ '^openapi_[a-f0-9]{32}__[a-zA-Z0-9_-]{1,64}$') and length(${table.toolName}) <= 128)`,
    ),
    check(
      "conversation_effects_state_check",
      sql`${table.state} in ('intent', 'succeeded', 'failed', 'unknown')`,
    ),
    check(
      "conversation_effects_key_check",
      sql`${table.key} ~ '^[a-f0-9]{64}$' and ${table.argumentHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "conversation_effects_outcome_check",
      sql`(${table.state} in ('intent', 'unknown') and ${table.result} is null and ${table.completedAt} is null) or (${table.state} in ('succeeded', 'failed') and ${table.result} is not null and length(${table.result}) <= 16384 and ${table.completedAt} is not null)`,
    ),
  ],
);

export const conversationEvents = pgTable(
  "conversation_events",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    kind: text("kind", {
      enum: [
        "message.created",
        "run.state",
        "reply.segment",
        "computer.state",
        "card.created",
        "card.resolved",
        "tool.started",
        "tool.finished",
      ],
    }).notNull(),
    messageId: text("message_id"),
    data: jsonb("data"),
    runId: text("run_id"),
    fence: bigint("fence", { mode: "number" }).notNull().default(0),
    segmentId: text("segment_id"),
    computerId: text("computer_id"),
    // Requests remain with their Run after membership removal.
    requestId: text("request_id"),
    pageId: text("page_id").generatedAlwaysAs(
      (): SQL =>
        sql`case when ${conversationEvents.kind} = 'tool.finished' then ${conversationEvents.data}->'page'->>'id' else null end`,
    ),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.sequence] }),
    foreignKey({
      columns: [table.spaceId, table.pageId],
      foreignColumns: [pageIdentities.spaceId, pageIdentities.id],
    }).onDelete("cascade"),
    index("conversation_events_activity_idx").on(
      table.spaceId,
      table.conversationId,
      table.sequence.desc(),
      table.createdAt,
    ),
    foreignKey({
      columns: [table.spaceId, table.conversationId],
      foreignColumns: [conversations.spaceId, conversations.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.messageId, table.sequence],
      foreignColumns: [
        conversationMessages.spaceId,
        conversationMessages.conversationId,
        conversationMessages.id,
        conversationMessages.sequence,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.segmentId],
      foreignColumns: [
        conversationReplySegments.spaceId,
        conversationReplySegments.conversationId,
        conversationReplySegments.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.computerId],
      foreignColumns: [computers.spaceId, computers.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId, table.requestId],
      foreignColumns: [
        approvalRequests.spaceId,
        approvalRequests.conversationId,
        approvalRequests.runId,
        approvalRequests.id,
      ],
    }).onDelete("cascade"),
    check(
      "conversation_events_payload_check",
      sql`(
      (${table.kind} = 'message.created' and ${table.messageId} is not null and ${table.runId} is null and ${table.segmentId} is null and ${table.data} is null and ${table.computerId} is null and ${table.requestId} is null) or
      (${table.kind} = 'run.state' and ${table.messageId} is null and ${table.runId} is not null and ${table.segmentId} is null and ${table.data} is not null and ${table.computerId} is null and ${table.requestId} is null) or
      (${table.kind} = 'reply.segment' and ${table.messageId} is null and ${table.runId} is not null and ${table.segmentId} is not null and ${table.data} is null and ${table.computerId} is null and ${table.requestId} is null) or
      (${table.kind} = 'computer.state' and ${table.messageId} is null and ${table.runId} is null and ${table.segmentId} is null and ${table.computerId} is not null and ${table.data} is not null and ${table.requestId} is null) or
      (${table.kind} in ('tool.started', 'tool.finished') and ${table.messageId} is null and ${table.runId} is not null and ${table.segmentId} is null and ${table.computerId} is null and ${table.requestId} is null and ${table.data} is not null) or
      (${table.kind} in ('card.created', 'card.resolved') and ${table.messageId} is null and ${table.runId} is not null and ${table.segmentId} is null and ${table.computerId} is null and ${table.requestId} is not null and ${table.data} is not null)
    )`,
    ),
    check(
      "conversation_events_kind_check",
      sql`${table.kind} in ('message.created', 'run.state', 'reply.segment', 'computer.state', 'card.created', 'card.resolved', 'tool.started', 'tool.finished')`,
    ),
  ],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secret: text().notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean().default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: date("locked_until"),
  },
  (table) => [
    index("two_factor_user_idx").on(table.userId),
    index("two_factor_secret_idx").on(table.secret),
  ],
);
export const passkey = pgTable(
  "passkey",
  {
    id: text().primaryKey(),
    name: text(),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull().unique(),
    counter: bigint({ mode: "number" }).notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text(),
    createdAt: date("created_at"),
    aaguid: text(),
  },
  (table) => [index("passkey_user_idx").on(table.userId)],
);
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: date("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_expires_at_idx").on(table.expiresAt),
  ],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: date("access_token_expires_at"),
    refreshTokenExpiresAt: date("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId),
  ],
);
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: date("expires_at").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("verification_identifier_idx").on(table.identifier),
    index("verification_expires_at_idx").on(table.expiresAt),
  ],
);

// Better Auth and API RPC limits share this table; keys are IP/path or rpc:<user>:<procedure>.
export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [index("rate_limit_last_request_idx").on(table.lastRequest)],
);

// One versioned row stores non-secret site settings. Policy belongs to API.
export const systemConfiguration = pgTable("system_configuration", {
  id: text("id").primaryKey(),
  siteName: text("site_name").notNull(),
  registrationEnabled: boolean("registration_enabled").notNull(),
  cleanupEnabled: boolean("cleanup_enabled").notNull(),
  revision: integer("revision").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: date("updated_at").notNull().defaultNow(),
});

export const storageConfiguration = pgTable("storage_configuration", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  region: text("region").notNull(),
  bucket: text("bucket").notNull(),
  credentials: text("credentials").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  revision: integer("revision").notNull().default(1),
  updatedAt: date("updated_at").notNull().defaultNow(),
});

export const mailConfiguration = pgTable("mail_configuration", {
  id: text("id").primaryKey(),
  from: text("sender").notNull(),
  defaultLocale: text("default_locale", { enum: ["en", "zh"] }).notNull(),
  enabled: boolean("enabled").notNull(),
  credentials: text("credentials").notNull(),
  revision: integer("revision").notNull(),
  updatedAt: date("updated_at").notNull().defaultNow(),
});

export const sessionAttachment = pgTable(
  "session_attachment",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    ready: boolean("ready").notNull().default(false),
    expiresAt: date("expires_at").notNull(),
  },
  (table) => [
    index("session_attachment_owner_idx").on(table.userId, table.expiresAt),
    index("session_attachment_expiry_idx").on(table.expiresAt),
  ],
);

// Control records are separate from authentication and never contain CLI credentials.
export const controlOwner = pgTable("control_owner", {
  securityEpoch: integer("security_epoch").notNull().default(0),
  securityRevokedAt: date("security_revoked_at"),
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
});
const controlRecord = (name: string) =>
  pgTable(
    name,
    {
      id: text("id").notNull(),
      userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
      deviceId: text("device_id").notNull(),
      body: jsonb("body").notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.userId, table.id] }),
      index(`${name}_device_idx`).on(table.userId, table.deviceId),
      ...(name === "control_credential" ? [index("control_credential_hash_idx").on(table.id)] : []),
      ...(name === "control_request"
        ? [index("control_request_task_idx").on(table.userId, sql`(${table.body}->>'taskId')`)]
        : []),
      ...(name === "control_command"
        ? [
            index("control_command_context_owner_idx")
              .on(
                table.userId,
                sql`coalesce(${table.body}->>'capturedAt',${table.body}->'context'->>'capturedAt','')`,
                table.id,
              )
              .where(sql`jsonb_typeof(${table.body}->'context')='object'`),
            index("control_command_context_expiry_idx")
              .on(
                sql`coalesce(${table.body}->>'capturedAt',${table.body}->'context'->>'capturedAt','')`,
                table.userId,
                table.id,
              )
              .where(sql`jsonb_typeof(${table.body}->'context')='object'`),
          ]
        : []),
      ...(name === "control_event"
        ? [
            index("control_event_activity_idx")
              .on(
                table.userId,
                sql`(${table.body}->>'taskId')`,
                sql`((${table.body}->'event'->'entry'->>'order')::bigint)`,
              )
              .where(sql`${table.body}->'event'->>'kind' = 'activity'`),
            index("control_event_task_cursor_idx")
              .on(
                table.userId,
                sql`(${table.body}->>'taskId')`,
                sql`((${table.body}->>'cursor')::bigint)`,
              )
              .where(sql`${table.body}->'event'->>'kind' != 'activity'`),
            index("control_event_replay_idx")
              .on(table.userId, table.deviceId, sql`((${table.body}->>'cursor')::bigint)`)
              .where(sql`${table.body}->'event'->>'kind' != 'activity'`),
            index("control_event_stream_idx").on(
              table.userId,
              table.deviceId,
              sql`(${table.body}->>'streamId')`,
              sql`((${table.body}->>'cursor')::bigint)`,
            ),
          ]
        : []),
    ],
  );
export const controlDevice = controlRecord("control_device");
export const controlProject = controlRecord("control_project");
export const controlTask = controlRecord("control_task");
export const controlRequest = controlRecord("control_request");
export const controlEvent = controlRecord("control_event");
export const controlCommand = controlRecord("control_command");
export const controlGrant = controlRecord("control_grant");
export const controlCredential = controlRecord("control_credential");
export const controlObservedSession = controlRecord("control_observed_session");
export const controlObservedRequest = controlRecord("control_observed_request");

export const cloudJob = pgTable(
  "cloud_job",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull(),
    enabled: boolean("enabled").notNull(),
    action: jsonb("action").notNull(),
    revision: integer("revision").notNull(),
    nextRunAt: date("next_run_at"),
    ...timestamps(),
  },
  (table) => [
    index("cloud_job_owner_idx").on(table.userId, table.createdAt, table.id),
    index("cloud_job_due_idx")
      .on(table.nextRunAt, table.id)
      .where(sql`${table.enabled}=true`),
  ],
);
export const cloudJobRun = pgTable(
  "cloud_job_run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => cloudJob.id, { onDelete: "cascade" }),
    jobRevision: integer("job_revision").notNull(),
    trigger: text("trigger").notNull(),
    scheduledFor: date("scheduled_for").notNull(),
    startedAt: date("started_at").notNull(),
    checkedAt: date("checked_at").notNull().defaultNow(),
    finishedAt: date("finished_at"),
    status: text("status").notNull(),
    action: jsonb("action").notNull(),
    taskId: text("task_id"),
    code: text("code"),
    sync: jsonb("sync"),
  },
  (table) => [
    uniqueIndex("cloud_job_run_schedule_idx")
      .on(table.jobId, table.scheduledFor)
      .where(sql`${table.trigger}='schedule'`),
    index("cloud_job_run_history_idx").on(table.userId, table.jobId, table.startedAt, table.id),
    index("cloud_job_run_active_idx")
      .on(table.checkedAt, table.id)
      .where(sql`${table.status} in ('dispatching','running','waiting','unknown')`),
  ],
);

// Account context libraries retain immutable revisions; archiving never deletes history.
export const contextDocument = pgTable(
  "context_document",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    project: jsonb("project"),
    revision: integer("revision").notNull(),
    archived: boolean("archived").notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    index("context_document_owner_idx").on(table.userId, table.updatedAt, table.id),
    uniqueIndex("context_document_canonical_id_idx").on(sql`lower(${table.id})`),
  ],
);
// Body-free deletion receipts reserve IDs so pinned references can never change identity.
export const contextDeletion = pgTable(
  "context_deletion",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    deletedAt: timestamp("deleted_at").notNull().defaultNow(),
  },
  (table) => [index("context_deletion_owner_idx").on(table.userId)],
);
export const contextVersion = pgTable(
  "context_version",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => contextDocument.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    body: jsonb("body").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.revision] }),
    index("context_version_owner_idx").on(table.userId, table.documentId, table.revision),
  ],
);

export const runtimeInstance = pgTable(
  "runtime_instance",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: jsonb("body").notNull(),
  },
  (table) => [index("runtime_instance_owner_idx").on(table.userId, table.id)],
);
export const instanceEnrollment = pgTable(
  "instance_enrollment",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: date("expires_at").notNull(),
    body: jsonb("body").notNull(),
  },
  (table) => [index("instance_enrollment_expiry_idx").on(table.expiresAt)],
);

// Independent of account lifetimes: immutable terminal management history.
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    actorId: text("actor_id"),
    source: text("source").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    outcome: text("outcome").notNull().default("pending"),
    errorCode: text("error_code"),
    before: jsonb("before"),
    after: jsonb("after"),
    startedAt: date("started_at").notNull().defaultNow(),
    completedAt: date("completed_at"),
  },
  (table) => [
    index("admin_audit_time_idx").on(table.startedAt, table.id),
    index("admin_audit_actor_time_idx").on(table.actorId, table.startedAt, table.id),
    index("admin_audit_target_time_idx").on(table.targetId, table.startedAt, table.id),
  ],
);

export const {
  jwks,
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthAccessToken,
  oauthRefreshToken,
  oauthConsent,
  oauthClientAssertion,
} = oauthTables(user, session);

// Identity tombstones retain Run attribution after active definitions and credentials disappear.
export const routineIdentities = pgTable(
  "routine_identities",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.spaceId, table.id] })],
);

export const routines = pgTable(
  "routines",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    agentId: text("agent_id").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    triggers: jsonb("triggers").notNull(),
    webhookDigest: text("webhook_digest"),
    emailAddress: text("email_address"),
    nextDueAt: date("next_due_at"),
    rateWindowAt: date("rate_window_at"),
    rateCount: integer("rate_count").notNull().default(0),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("routines_rate_count_check", sql`${table.rateCount} >= 0`),
    primaryKey({ columns: [table.spaceId, table.id] }),
    foreignKey({
      columns: [table.spaceId, table.id],
      foreignColumns: [routineIdentities.spaceId, routineIdentities.id],
    }).onDelete("cascade"),
    uniqueIndex("routines_ingress_id_idx").on(table.id),
    uniqueIndex("routines_email_idx").on(table.emailAddress),
    index("routines_due_idx").on(table.enabled, table.nextDueAt, table.id),
    index("routines_agent_idx").on(table.spaceId, table.agentId, table.createdAt, table.id),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.ownerAccountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
  ],
);
export const routineSecrets = pgTable(
  "routine_secrets",
  {
    spaceId: text("space_id").notNull(),
    routineId: text("routine_id").notNull(),
    id: text("id").notNull(),
    accountId: text("account_id").notNull(),
    keyId: text("key_id").notNull(),
    wrappedDataKey: text("wrapped_data_key").notNull(),
    ciphertext: text("ciphertext").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.routineId] }),
    foreignKey({
      columns: [table.spaceId, table.routineId],
      foreignColumns: [routines.spaceId, routines.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
  ],
);
export const routineOccurrences = pgTable(
  "routine_occurrences",
  {
    spaceId: text("space_id").notNull(),
    routineId: text("routine_id").notNull(),
    id: text("id").notNull(),
    kind: text("kind", {
      enum: ["schedule", "manual", "webhook", "email", "repository"],
    }).notNull(),
    dueAt: date("due_at").notNull(),
    createdAt: date("created_at").notNull(),
    status: text("status", { enum: ["fired", "coalesced", "ignored"] }).notNull(),
    runId: text("run_id"),
    conversationId: text("conversation_id"),
  },
  (table) => [
    check(
      "routine_occurrences_kind_check",
      sql`${table.kind} in ('schedule', 'manual', 'webhook', 'email', 'repository')`,
    ),
    check(
      "routine_occurrences_status_check",
      sql`${table.status} in ('fired', 'coalesced', 'ignored')`,
    ),
    check(
      "routine_occurrences_run_check",
      sql`(${table.runId} is null) = (${table.conversationId} is null)`,
    ),
    primaryKey({ columns: [table.spaceId, table.routineId, table.id] }),
    uniqueIndex("routine_occurrences_event_ref_idx").on(
      table.spaceId,
      table.routineId,
      table.id,
      table.conversationId,
      table.runId,
    ),
    index("routine_occurrences_history_idx").on(
      table.spaceId,
      table.routineId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      columns: [table.spaceId, table.routineId],
      foreignColumns: [routines.spaceId, routines.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
  ],
);
export const routineDeliveries = pgTable(
  "routine_deliveries",
  {
    spaceId: text("space_id").notNull(),
    routineId: text("routine_id").notNull(),
    kind: text("kind").notNull(),
    id: text("id").notNull(),
    bodyDigest: text("body_digest").notNull(),
    occurrenceId: text("occurrence_id").notNull(),
    createdAt: date("created_at").notNull(),
  },
  (table) => [
    check(
      "routine_deliveries_kind_check",
      sql`${table.kind} in ('manual', 'webhook', 'email', 'repository')`,
    ),
    primaryKey({ columns: [table.spaceId, table.routineId, table.kind, table.id] }),
    foreignKey({
      columns: [table.spaceId, table.routineId, table.occurrenceId],
      foreignColumns: [
        routineOccurrences.spaceId,
        routineOccurrences.routineId,
        routineOccurrences.id,
      ],
    }).onDelete("cascade"),
  ],
);
export const routineEvents = pgTable(
  "routine_events",
  {
    spaceId: text("space_id").notNull(),
    routineId: text("routine_id").notNull(),
    id: text("id").notNull(),
    kind: text("kind", { enum: ["routine.fired", "routine.coalesced"] }).notNull(),
    occurrenceId: text("occurrence_id").notNull(),
    runId: text("run_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    dueAt: date("due_at").notNull(),
    firedAt: date("fired_at").notNull(),
  },
  (table) => [
    check(
      "routine_events_kind_check",
      sql`${table.kind} in ('routine.fired', 'routine.coalesced')`,
    ),
    primaryKey({ columns: [table.spaceId, table.routineId, table.id] }),
    index("routine_events_run_idx").on(table.spaceId, table.conversationId, table.runId),
    foreignKey({
      columns: [
        table.spaceId,
        table.routineId,
        table.occurrenceId,
        table.conversationId,
        table.runId,
      ],
      foreignColumns: [
        routineOccurrences.spaceId,
        routineOccurrences.routineId,
        routineOccurrences.id,
        routineOccurrences.conversationId,
        routineOccurrences.runId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
  ],
);

export const spaceMemoryDocuments = pgTable(
  "space_memory_documents",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    scope: text("scope", { enum: ["agent", "space"] }).notNull(),
    agentId: text("agent_id"),
    title: text("title").notNull(),
    text: text("text"),
    pinned: boolean("pinned").notNull().default(false),
    removed: boolean("removed").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    attribution: jsonb("attribution").notNull(),
    provenance: jsonb("provenance").notNull(),
    // Attribution survives membership removal. The FK never prevents account deletion.
    authorAccountId: text("author_account_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    index("space_memory_recall_idx").on(
      table.spaceId,
      table.agentId,
      table.pinned,
      table.updatedAt,
      table.id,
    ),
    check(
      "space_memory_scope_check",
      sql`(${table.scope} = 'agent' and ${table.agentId} is not null) or (${table.scope} = 'space' and ${table.agentId} is null)`,
    ),
    check(
      "space_memory_removed_check",
      sql`(${table.removed} and ${table.text} is null) or (not ${table.removed} and ${table.text} is not null)`,
    ),
    check("space_memory_revision_check", sql`${table.revision} > 0`),
  ],
);
export const spaceMemoryRevisions = pgTable(
  "space_memory_revisions",
  {
    spaceId: text("space_id").notNull(),
    documentId: text("document_id").notNull(),
    revision: integer("revision").notNull(),
    reason: text("reason", { enum: ["created", "edited", "removed", "restored"] }).notNull(),
    body: jsonb("body").notNull(),
    mutationKey: text("mutation_key"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.documentId, table.revision] }),
    check(
      "space_memory_revision_body_identity_check",
      sql`coalesce(
      (${table.body}->>'spaceId') = ${table.spaceId} and
      (${table.body}->>'id') = ${table.documentId} and
      (${table.body}->>'revision') = ${table.revision}::text, false)`,
    ),
    foreignKey({
      columns: [table.spaceId, table.documentId],
      foreignColumns: [spaceMemoryDocuments.spaceId, spaceMemoryDocuments.id],
    }).onDelete("cascade"),
    uniqueIndex("space_memory_mutation_idx")
      .on(table.spaceId, table.mutationKey)
      .where(sql`${table.mutationKey} is not null`),
  ],
);

export const conversationRunMemoryPins = pgTable(
  "conversation_run_memory_pins",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    documentId: text("document_id").notNull(),
    revision: integer("revision").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.spaceId, table.conversationId, table.runId, table.documentId, table.revision],
    }),
    uniqueIndex("conversation_run_memory_pins_position_idx").on(
      table.spaceId,
      table.conversationId,
      table.runId,
      table.position,
    ),
    index("conversation_run_memory_pins_source_idx").on(
      table.spaceId,
      table.documentId,
      table.revision,
    ),
    check("conversation_run_memory_pins_position_check", sql`${table.position} >= 0`),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRunCheckpoints.spaceId,
        conversationRunCheckpoints.conversationId,
        conversationRunCheckpoints.runId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.documentId, table.revision],
      foreignColumns: [
        spaceMemoryRevisions.spaceId,
        spaceMemoryRevisions.documentId,
        spaceMemoryRevisions.revision,
      ],
    }).onDelete("cascade"),
  ],
);

export const pages = pgTable(
  "pages",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    agentId: text("agent_id"),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["document", "html"] }).notNull(),
    version: integer("version").notNull().default(1),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    foreignKey({
      columns: [table.spaceId, table.id],
      foreignColumns: [pageIdentities.spaceId, pageIdentities.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    index("pages_list_idx").on(table.spaceId, table.updatedAt, table.id),
    index("pages_agent_idx").on(table.spaceId, table.agentId),
    check("pages_kind_check", sql`${table.kind} in ('document', 'html')`),
    check("pages_version_check", sql`${table.version} > 0`),
    check("pages_title_check", sql`length(${table.title}) between 1 and 200`),
  ],
);
export const pageVersions = pgTable(
  "page_versions",
  {
    spaceId: text("space_id").notNull(),
    pageId: text("page_id").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["document", "html"] }).notNull(),
    body: text("body").notNull(),
    // Historical attribution, never an account, membership or execution grant.
    author: jsonb("author")
      .$type<{ kind: "member" | "run"; accountId: string; runId: string | null }>()
      .notNull(),
    reason: text("reason", { enum: ["created", "updated", "renamed", "restored"] }).notNull(),
    mutationKey: text("mutation_key"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.pageId, table.version] }),
    foreignKey({
      columns: [table.spaceId, table.pageId],
      foreignColumns: [pages.spaceId, pages.id],
    }).onDelete("cascade"),
    uniqueIndex("page_versions_mutation_idx")
      .on(table.spaceId, table.mutationKey)
      .where(sql`${table.mutationKey} is not null`),
    check("page_versions_version_check", sql`${table.version} > 0`),
    check("page_versions_kind_check", sql`${table.kind} in ('document', 'html')`),
    check(
      "page_versions_reason_check",
      sql`${table.reason} in ('created', 'updated', 'renamed', 'restored')`,
    ),
    check("page_versions_size_check", sql`octet_length(${table.body}) <= 262144`),
  ],
);
export const pageShareLinks = pgTable(
  "page_share_links",
  {
    spaceId: text("space_id").notNull(),
    id: text("id").notNull(),
    pageId: text("page_id").notNull(),
    version: integer("version"),
    tokenHash: text("token_hash").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
    expiresAt: date("expires_at"),
    revokedAt: date("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    foreignKey({
      columns: [table.spaceId, table.pageId],
      foreignColumns: [pages.spaceId, pages.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.pageId, table.version],
      foreignColumns: [pageVersions.spaceId, pageVersions.pageId, pageVersions.version],
    }).onDelete("cascade"),
    uniqueIndex("page_share_links_token_idx").on(table.tokenHash),
    index("page_share_links_page_idx").on(table.spaceId, table.pageId, table.createdAt, table.id),
    check("page_share_links_hash_check", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
    check("page_share_links_version_check", sql`${table.version} is null or ${table.version} > 0`),
  ],
);

const skillTimes = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
const skillContentColumns = () => ({
  name: text("name").notNull(),
  description: text("description").notNull(),
  body: text("body").notNull(),
});
export const memberSkills = pgTable(
  "member_skills",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...skillContentColumns(),
    availability: text("availability", { enum: ["all", "selected"] }).notNull(),
    ...skillTimes(),
  },
  (table) => [
    unique("member_skills_owner_idx").on(table.id, table.accountId),
    index("member_skills_account_idx").on(table.accountId, table.createdAt, table.id),
    check("member_skills_availability_check", sql`${table.availability} in ('all', 'selected')`),
    check(
      "member_skills_size_check",
      sql`length(${table.name}) between 1 and 120 and length(${table.description}) between 1 and 500 and octet_length(${table.body}) <= 256000`,
    ),
  ],
);
export const memberSkillSpaces = pgTable(
  "member_skill_spaces",
  {
    skillId: text("skill_id").notNull(),
    accountId: text("account_id").notNull(),
    spaceId: text("space_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.skillId, table.spaceId] }),
    foreignKey({
      columns: [table.skillId, table.accountId],
      foreignColumns: [memberSkills.id, memberSkills.accountId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    index("member_skill_spaces_member_idx").on(table.spaceId, table.accountId, table.skillId),
  ],
);
export const spaceSkills = pgTable(
  "space_skills",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    agentId: text("agent_id").notNull(),
    ...skillContentColumns(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...skillTimes(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    index("space_skills_order_idx").on(table.spaceId, table.createdAt, table.id),
    check(
      "space_skills_size_check",
      sql`length(${table.name}) between 1 and 120 and length(${table.description}) between 1 and 500 and octet_length(${table.body}) <= 256000`,
    ),
  ],
);
export const agentMemberSkills = pgTable(
  "agent_member_skills",
  {
    spaceId: text("space_id").notNull(),
    agentId: text("agent_id").notNull(),
    accountId: text("account_id").notNull(),
    skillId: text("skill_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.agentId, table.accountId, table.skillId] }),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.skillId, table.accountId],
      foreignColumns: [memberSkills.id, memberSkills.accountId],
    }).onDelete("cascade"),
    index("agent_member_skills_skill_idx").on(table.skillId, table.accountId),
  ],
);
export const agentSpaceSkills = pgTable(
  "agent_space_skills",
  {
    spaceId: text("space_id").notNull(),
    agentId: text("agent_id").notNull(),
    accountId: text("account_id").notNull(),
    skillId: text("skill_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.agentId, table.accountId, table.skillId] }),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.skillId],
      foreignColumns: [spaceSkills.spaceId, spaceSkills.id],
    }).onDelete("cascade"),
    index("agent_space_skills_skill_idx").on(table.spaceId, table.skillId),
  ],
);
export const skillMutations = pgTable(
  "skill_mutations",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    runId: text("run_id").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    skillId: text("skill_id").notNull(),
    digest: text("digest").notNull(),
    fence: integer("fence").notNull(),
    result: jsonb("result").$type<{ id: string }>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.runId, table.toolCallId] }),
    foreignKey({
      columns: [table.spaceId, table.conversationId, table.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.spaceId, table.skillId],
      foreignColumns: [spaceSkills.spaceId, spaceSkills.id],
    }).onDelete("cascade"),
    index("skill_mutations_skill_idx").on(table.spaceId, table.skillId),
  ],
);

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    availability: text("availability", { enum: ["all", "selected"] }).notNull(),
    secretId: text("secret_id").notNull(),
    hasCredentials: boolean("has_credentials").notNull().default(false),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("mcp_servers_owner_idx").on(t.id, t.accountId),
    unique("mcp_servers_secret_owner_idx").on(t.id, t.accountId, t.secretId),
    index("mcp_servers_account_idx").on(t.accountId, t.createdAt, t.id),
    check("mcp_servers_availability_check", sql`${t.availability} in ('all', 'selected')`),
  ],
);
export const mcpServerSecrets = pgTable(
  "mcp_server_secrets",
  {
    id: text("id").primaryKey(),
    serverId: text("server_id").notNull(),
    accountId: text("account_id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    wrappedDataKey: text("wrapped_data_key").notNull(),
    keyId: text("key_id").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.serverId, t.accountId, t.id],
      foreignColumns: [mcpServers.id, mcpServers.accountId, mcpServers.secretId],
    }).onDelete("cascade"),
    index("mcp_server_secrets_owner_idx").on(t.accountId, t.serverId),
  ],
);
export const mcpServerSpaces = pgTable(
  "mcp_server_spaces",
  {
    serverId: text("server_id").notNull(),
    accountId: text("account_id").notNull(),
    spaceId: text("space_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.serverId, t.spaceId] }),
    foreignKey({
      columns: [t.serverId, t.accountId],
      foreignColumns: [mcpServers.id, mcpServers.accountId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    index("mcp_server_spaces_member_idx").on(t.spaceId, t.accountId, t.serverId),
  ],
);
export const agentMcpServers = pgTable(
  "agent_mcp_servers",
  {
    spaceId: text("space_id").notNull(),
    agentId: text("agent_id").notNull(),
    accountId: text("account_id").notNull(),
    serverId: text("server_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.agentId, t.accountId, t.serverId] }),
    foreignKey({
      columns: [t.spaceId, t.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.serverId, t.accountId],
      foreignColumns: [mcpServers.id, mcpServers.accountId],
    }).onDelete("cascade"),
    index("agent_mcp_servers_owner_idx").on(t.accountId, t.serverId),
  ],
);

export const openApiServers = pgTable(
  "openapi_servers",
  {
    spaceId: text("space_id").notNull(),
    id: text("id").notNull(),
    credentialOwnerId: text("credential_owner_id").notNull(),
    secretId: text("secret_id").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    operations: jsonb("operations").$type<unknown[]>().notNull(),
    selectedOperationIds: jsonb("selected_operation_ids").$type<string[]>().notNull(),
    availability: text("availability", { enum: ["all", "selected"] }).notNull(),
    hasCredentials: boolean("has_credentials").notNull().default(false),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.id] }),
    foreignKey({ columns: [t.spaceId], foreignColumns: [spaces.id] }).onDelete("cascade"),
    unique("openapi_servers_secret_idx").on(t.spaceId, t.id, t.secretId),
    check("openapi_servers_availability_check", sql`${t.availability} in ('all', 'selected')`),
    index("openapi_servers_space_idx").on(t.spaceId, t.createdAt, t.id),
  ],
);
export const openApiServerSecrets = pgTable(
  "openapi_server_secrets",
  {
    spaceId: text("space_id").notNull(),
    serverId: text("server_id").notNull(),
    id: text("id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    wrappedDataKey: text("wrapped_data_key").notNull(),
    keyId: text("key_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.serverId] }),
    foreignKey({
      columns: [t.spaceId, t.serverId, t.id],
      foreignColumns: [openApiServers.spaceId, openApiServers.id, openApiServers.secretId],
    }).onDelete("cascade"),
  ],
);
export const openApiServerAgents = pgTable(
  "openapi_server_agents",
  {
    spaceId: text("space_id").notNull(),
    serverId: text("server_id").notNull(),
    agentId: text("agent_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.serverId, t.agentId] }),
    foreignKey({
      columns: [t.spaceId, t.serverId],
      foreignColumns: [openApiServers.spaceId, openApiServers.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    index("openapi_server_agents_agent_idx").on(t.spaceId, t.agentId, t.serverId),
  ],
);

/** Restricted connector identities are separate from retained control devices and enrollment. */
export const deviceComputers = pgTable(
  "device_computers",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    origin: text("origin").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    credentialHash: text("credential_hash").notNull(),
    previousCredentialHash: text("previous_credential_hash"),
    credentialRevision: bigint("credential_revision", { mode: "number" }).notNull().default(1),
    connectionFence: bigint("connection_fence", { mode: "number" }).notNull().default(0),
    connectionOwner: text("connection_owner"),
    connectionExpiresAt: date("connection_expires_at"),
    cursor: bigint("cursor", { mode: "number" }).notNull().default(0),
    revokedAt: date("revoked_at"),
    ...timestamps(),
  },
  (t) => [
    unique("device_computers_owner_key").on(t.id, t.accountId),
    index("device_computers_owner_idx").on(t.accountId),
    check(
      "device_computers_fence_check",
      sql`${t.connectionFence} >= 0 and ${t.credentialRevision} > 0 and ${t.cursor} >= 0`,
    ),
  ],
);
export const deviceComputerPairings = pgTable(
  "device_computer_pairings",
  {
    spaceId: text("space_id").notNull(),
    id: text("id").notNull(),
    accountId: text("account_id").notNull(),
    codeHash: text("code_hash").notNull(),
    claimTokenHash: text("claim_token_hash"),
    deviceName: text("device_name"),
    platform: text("platform"),
    expiresAt: date("expires_at").notNull(),
    consumedAt: date("consumed_at"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.id] }),
    uniqueIndex("device_computer_pairings_code_idx").on(t.codeHash),
    foreignKey({
      columns: [t.spaceId, t.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
  ],
);
export const deviceSpaceDevices = pgTable(
  "device_space_devices",
  {
    spaceId: text("space_id").notNull(),
    deviceId: text("device_id").notNull(),
    accountId: text("account_id").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.deviceId] }),
    unique("device_space_devices_owner_key").on(t.spaceId, t.deviceId, t.accountId),
    foreignKey({
      columns: [t.deviceId, t.accountId],
      foreignColumns: [deviceComputers.id, deviceComputers.accountId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.accountId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.accountId],
    }).onDelete("cascade"),
  ],
);
export const deviceDirectoryGrants = pgTable(
  "device_directory_grants",
  {
    spaceId: text("space_id").notNull(),
    id: text("id").notNull(),
    deviceId: text("device_id").notNull(),
    accountId: text("account_id").notNull(),
    directory: text("directory").notNull(),
    revision: bigint("revision", { mode: "number" }).notNull().default(1),
    revokedAt: date("revoked_at"),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.id] }),
    unique("device_directory_grants_owner_key").on(t.spaceId, t.id, t.deviceId, t.accountId),
    foreignKey({
      columns: [t.spaceId, t.id],
      foreignColumns: [computers.spaceId, computers.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.deviceId, t.accountId],
      foreignColumns: [
        deviceSpaceDevices.spaceId,
        deviceSpaceDevices.deviceId,
        deviceSpaceDevices.accountId,
      ],
    }).onDelete("cascade"),
    check("device_directory_grants_revision_check", sql`${t.revision} > 0`),
  ],
);
export const deviceComputerSelections = pgTable(
  "device_computer_selections",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    accountId: text("account_id").notNull(),
    deviceId: text("device_id").notNull(),
    grantId: text("grant_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.conversationId, t.accountId] }),
    foreignKey({
      columns: [t.spaceId, t.conversationId],
      foreignColumns: [conversations.spaceId, conversations.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.grantId, t.deviceId, t.accountId],
      foreignColumns: [
        deviceDirectoryGrants.spaceId,
        deviceDirectoryGrants.id,
        deviceDirectoryGrants.deviceId,
        deviceDirectoryGrants.accountId,
      ],
    }).onDelete("cascade"),
  ],
);
export const deviceConnectorOperations = pgTable(
  "device_connector_operations",
  {
    spaceId: text("space_id").notNull(),
    id: text("id").notNull(),
    deviceId: text("device_id").notNull(),
    grantId: text("grant_id").notNull(),
    accountId: text("account_id").notNull(),
    runId: text("run_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    runFence: bigint("run_fence", { mode: "number" }).notNull(),
    connectionFence: bigint("connection_fence", { mode: "number" }).notNull(),
    outputBytes: integer("output_bytes").notNull().default(0),
    terminal: boolean("terminal").notNull().default(false),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.id] }),
    unique("device_connector_operations_device_key").on(t.deviceId, t.id),
    foreignKey({
      columns: [t.spaceId, t.grantId, t.deviceId, t.accountId],
      foreignColumns: [
        deviceDirectoryGrants.spaceId,
        deviceDirectoryGrants.id,
        deviceDirectoryGrants.deviceId,
        deviceDirectoryGrants.accountId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.spaceId, t.conversationId, t.runId],
      foreignColumns: [
        conversationRuns.spaceId,
        conversationRuns.conversationId,
        conversationRuns.id,
      ],
    }).onDelete("cascade"),
    check(
      "device_connector_operations_bounds_check",
      sql`${t.outputBytes} >= 0 and ${t.outputBytes} <= 1048576 and ${t.runFence} > 0 and ${t.connectionFence} > 0`,
    ),
  ],
);
export const deviceConnectorEvents = pgTable(
  "device_connector_events",
  {
    spaceId: text("space_id").notNull(),
    deviceId: text("device_id").notNull(),
    operationId: text("operation_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    event: jsonb("event").$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.sequence] }),
    foreignKey({
      columns: [t.spaceId, t.operationId],
      foreignColumns: [deviceConnectorOperations.spaceId, deviceConnectorOperations.id],
    }).onDelete("cascade"),
  ],
);

export const schema = {
  deviceComputers,
  deviceComputerPairings,
  deviceSpaceDevices,
  deviceDirectoryGrants,
  deviceComputerSelections,
  deviceConnectorOperations,
  deviceConnectorEvents,
  openApiServers,
  openApiServerSecrets,
  openApiServerAgents,
  pageIdentities,
  pages,
  pageVersions,
  pageShareLinks,
  memberSkills,
  memberSkillSpaces,
  spaceSkills,
  agentMemberSkills,
  agentSpaceSkills,
  skillMutations,
  mcpServers,
  mcpServerSecrets,
  mcpServerSpaces,
  agentMcpServers,
  spaceInvitations,
  spaceSettingsOverrides,
  spaceAudit,
  spaceEvents,
  spaceDeletionJobs,
  routineIdentities,
  conversationRunMemoryPins,
  spaceMemoryDocuments,
  spaceMemoryRevisions,
  routines,
  routineSecrets,
  routineOccurrences,
  routineDeliveries,
  routineEvents,
  modelConnections,
  modelConnectionSecrets,
  modelConnectionSpaces,
  conversationToolCalls,
  computers,
  computerScreenControls,
  computerScreenViewers,
  conversationRuns,
  conversationRunAttempts,
  conversationRunCheckpoints,
  conversationRunSteering,
  conversationRunBackupJobs,
  conversationReplySegments,
  conversationCounters,
  conversationMessages,
  conversationEvents,
  approvalSettings,
  approvalRules,
  approvalRequests,
  conversationEffects,
  spaces,
  spaceMembers,
  agents,
  conversations,
  passkey,
  twoFactor,
  jwks,
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthAccessToken,
  oauthRefreshToken,
  oauthConsent,
  oauthClientAssertion,
  adminAudit,
  runtimeInstance,
  instanceEnrollment,
  contextDocument,
  contextDeletion,
  contextVersion,
  cloudJob,
  cloudJobRun,
  systemConfiguration,
  storageConfiguration,
  mailConfiguration,
  sessionAttachment,
  user,
  session,
  account,
  verification,
  rateLimit,
  controlOwner,
  controlDevice,
  controlProject,
  controlTask,
  controlRequest,
  controlEvent,
  controlCommand,
  controlGrant,
  controlCredential,
  controlObservedSession,
  controlObservedRequest,
};
export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
    accounts: r.many.account({ from: r.user.id, to: r.account.userId }),
  },
  session: { user: r.one.user({ from: r.session.userId, to: r.user.id, optional: false }) },
  account: { user: r.one.user({ from: r.account.userId, to: r.user.id, optional: false }) },
}));
