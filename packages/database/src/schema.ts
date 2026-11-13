import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  integer,
  jsonb,
  primaryKey,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { defineRelations, sql } from "drizzle-orm";
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
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.accountId] }),
    index("space_members_account_idx").on(table.accountId, table.spaceId),
    check("space_members_role_check", sql`${table.role} in ('owner', 'member')`),
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
    ...timestamps(),
  },
  (table) => [primaryKey({ columns: [table.spaceId, table.id] })],
);
export const conversations = pgTable(
  "conversations",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    agentId: text("agent_id").notNull(),
    kind: text("kind", { enum: ["direct"] }).notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.id] }),
    uniqueIndex("conversations_direct_agent_idx").on(table.spaceId, table.agentId),
    foreignKey({
      columns: [table.spaceId, table.agentId],
      foreignColumns: [agents.spaceId, agents.id],
    }).onDelete("cascade"),
    check("conversations_kind_check", sql`${table.kind} = 'direct'`),
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
    authorAccountId: text("author_account_id")
      .notNull()
      .references(() => user.id),
    idempotencyKey: text("idempotency_key").notNull(),
    text: text("text").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.id] }),
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
export const conversationEvents = pgTable(
  "conversation_events",
  {
    spaceId: text("space_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    kind: text("kind", { enum: ["message.created"] }).notNull(),
    messageId: text("message_id").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.conversationId, table.sequence] }),
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
    check("conversation_events_kind_check", sql`${table.kind} = 'message.created'`),
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

export const schema = {
  conversationCounters,
  conversationMessages,
  conversationEvents,
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
