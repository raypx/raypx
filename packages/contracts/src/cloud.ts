import { eventIterator, oc } from "@orpc/contract";
import { z } from "zod";
import { procedure } from "./common.js";

const identifier = z.string().min(1).max(200);
const intent = { idempotencyKey: identifier };
const project = { projectId: identifier.optional() };
export const resourceScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("personal"), ownerUserId: identifier }),
  z.object({ type: z.literal("project"), projectId: identifier }),
]);
const fields = {
  id: identifier,
  scope: resourceScopeSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
};
export const cloudTaskStatusSchema = z.enum([
  "open",
  "in_progress",
  "waiting_input",
  "review",
  "completed",
  "cancelled",
]);
export const cloudRunStatusSchema = z.enum([
  "queued",
  "running",
  "needs_input",
  "succeeded",
  "failed",
  "cancelled",
]);
export const cloudModeSchema = z.enum(["search", "computer"]);
export const cloudConversationSchema = z.object({
  ...fields,
  title: z.string(),
  createdByUserId: identifier,
  idempotencyKey: identifier,
});
export const cloudTurnSchema = z.object({
  ...fields,
  conversationId: identifier,
  actorId: identifier,
  prompt: z.string(),
  mode: cloudModeSchema,
  runId: identifier,
  attachmentIds: z.array(identifier),
  idempotencyKey: identifier,
});
export const cloudTaskSchema = z.object({
  ...fields,
  title: z.string(),
  goal: z.string(),
  currentRoundId: identifier,
  goalVersion: z.number().int().positive(),
  requestedByUserId: identifier,
  status: cloudTaskStatusSchema,
  conversationId: identifier.nullable(),
  currentRevisionId: identifier.nullable(),
  acceptedRevisionId: identifier.nullable(),
  idempotencyKey: identifier,
});
export const cloudTaskRoundSchema = z.object({
  ...fields,
  taskId: identifier,
  goalVersion: z.number().int().positive(),
  goal: z.string(),
  attachmentIds: z.array(identifier),
  callBudget: z.number().int().positive(),
  durationBudgetMs: z.number().int().positive(),
  createdByUserId: identifier,
  idempotencyKey: identifier,
});
export const cloudMessageSchema = z.object({
  ...fields,
  runId: identifier,
  messageId: identifier,
  executionId: identifier.nullable(),
  text: z.string(),
  completed: z.boolean(),
  sequence: z.number().int().positive(),
});
export const cloudRunSchema = z.object({
  ...fields,
  conversationId: identifier,
  turnId: z.string(),
  taskId: identifier.nullable(),
  roundId: identifier.nullable(),
  ownerAccountId: identifier,
  requestedByUserId: identifier,
  mode: cloudModeSchema,
  prompt: z.string(),
  attachmentIds: z.array(identifier),
  status: cloudRunStatusSchema,
  attempt: z.number().int().positive(),
  retryOfRunId: identifier.nullable(),
  lastSequence: z.number().int().nonnegative(),
  ownerId: identifier.nullable(),
  epoch: z.number().int().nonnegative(),
  heartbeatAt: z.date().nullable(),
  leaseExpiresAt: z.date().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  cancelRequested: z.boolean(),
  output: z.string().nullable(),
  error: z.string().nullable(),
  dispatchReady: z.boolean(),
});
export const cloudAgentExecutionSchema = z.object({
  ...fields,
  runId: identifier,
  parentId: identifier.nullable(),
  role: z.string(),
  prompt: z.string(),
  status: cloudRunStatusSchema,
  output: z.string().nullable(),
  depth: z.number().int().min(0).max(1),
});
export const cloudToolExecutionSchema = z.object({
  ...fields,
  runId: identifier,
  executionId: identifier,
  name: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  status: z.enum(["running", "succeeded", "failed", "cancelled"]),
});
export const cloudSourceEvidenceSchema = z.object({
  ...fields,
  runId: identifier,
  url: z.string(),
  title: z.string(),
  excerpt: z.string(),
});
export const cloudAssetVersionSchema = z.object({
  ...fields,
  requestedByUserId: identifier,
  ownerAccountId: identifier,
  name: z.string(),
  objectKey: z.string(),
  mediaType: z.string(),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string(),
  published: z.boolean(),
  verifiedAt: z.date().nullable(),
  uploadId: identifier,
  idempotencyKey: identifier,
  runId: identifier.nullable(),
  expiresAt: z.date(),
});
export const cloudArtifactRevisionSchema = z.object({
  ...fields,
  taskId: identifier,
  roundId: identifier,
  goalVersion: z.number().int().positive(),
  runId: identifier,
  assetVersionIds: z.array(identifier),
  summary: z.string(),
  revision: z.number().int().positive(),
});
export const cloudCommandSchema = z.object({
  ...fields,
  runId: identifier,
  actorId: identifier,
  idempotencyKey: identifier,
  type: z.enum(["cancel", "steer"]),
  text: z.string().nullable(),
  status: z.enum(["pending", "applied", "rejected"]),
});
export const cloudRunEventSchema = z.object({
  runId: identifier,
  sequence: z.number().int().positive(),
  occurredAt: z.date(),
  type: z.enum([
    "message.delta",
    "message.completed",
    "tool.started",
    "tool.completed",
    "source.created",
    "execution.started",
    "execution.completed",
    "run.status",
    "artifact.published",
    "usage.settled",
  ]),
  executionId: identifier.nullable(),
  payload: z.record(z.string(), z.unknown()),
  eventId: identifier,
});
export const cloudRunSnapshotSchema = z.object({
  run: cloudRunSchema,
  events: z.array(cloudRunEventSchema),
  messages: z.array(cloudMessageSchema),
  executions: z.array(cloudAgentExecutionSchema),
  sources: z.array(cloudSourceEvidenceSchema),
  artifacts: z.array(cloudAssetVersionSchema),
  commands: z.array(cloudCommandSchema),
  cursor: z.number().int().nonnegative(),
  historyTruncated: z.boolean(),
  historyCursor: z.number().int().positive().nullable(),
});
export const cloudUsageSummarySchema = z.object({
  calls: z.number().int().nonnegative(),
  reservedCalls: z.number().int().nonnegative(),
  unknownCalls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedCost: z.number().nonnegative(),
  storageBytes: z.number().int().nonnegative(),
  activeRuns: z.number().int().nonnegative(),
  limits: z.object({
    accountCalls: z.number().int().positive(),
    accountConcurrentRuns: z.number().int().positive(),
    accountStorageBytes: z.number().int().positive(),
    taskCalls: z.number().int().positive(),
    taskDurationMs: z.number().int().positive(),
    singleCallMaxTokens: z.number().int().positive(),
  }),
});
export const cloudNotificationSchema = z.object({
  ...fields,
  recipientId: identifier,
  taskId: identifier.nullable(),
  conversationId: identifier.nullable(),
  runId: identifier.nullable(),
  type: z.enum(["task.review", "run.failed", "task.waiting_input", "task.completed"]),
  readAt: z.date().nullable(),
  emailEnabled: z.boolean(),
  emailDeliveredAt: z.date().nullable(),
});
export const cloudPreferencesSchema = z.object({
  ...fields,
  actorId: identifier,
  emailEnabled: z.boolean(),
  locale: z.enum(["en", "zh"]),
});
export const getCloudPreferences = procedure({}, cloudPreferencesSchema);
export const updateCloudPreferences = procedure(
  { ...intent, emailEnabled: z.boolean(), locale: z.enum(["en", "zh"]) },
  cloudPreferencesSchema,
);
export const cloudCapabilitiesSchema = z.object({
  search: z.boolean(),
  computer: z.boolean(),
  delegation: z.boolean(),
  export: z.boolean(),
  unavailableReason: z.string().nullable(),
});
export const cloudConversationSnapshotSchema = z.object({
  conversation: cloudConversationSchema,
  turns: z.array(cloudTurnSchema),
  runs: z.array(cloudRunSchema),
  historyCursor: z.string().nullable(),
});
const listing = {
  ...project,
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(2048).optional(),
};
const runKey = { runId: identifier };
const assetKey = { assetVersionId: identifier };
const cloudPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export const createCloudConversation = procedure(
  { ...project, ...intent, title: z.string().trim().min(1).max(200) },
  cloudConversationSchema,
);
export const listCloudConversations = procedure(listing, cloudPageSchema(cloudConversationSchema));
export const getCloudConversation = procedure(
  { conversationId: identifier },
  cloudConversationSnapshotSchema,
);
export const streamCloudConversation = oc
  .input(z.object({ conversationId: identifier }))
  .output(eventIterator(cloudConversationSnapshotSchema));
export const historyCloudConversation = procedure(
  {
    conversationId: identifier,
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  },
  z.object({
    items: z.array(cloudTurnSchema),
    nextCursor: z.string().nullable(),
    runs: z.array(cloudRunSchema),
  }),
);
export const sendCloudTurn = procedure(
  {
    conversationId: identifier,
    ...intent,
    prompt: z.string().trim().min(1).max(65536),
    mode: cloudModeSchema,
    taskId: identifier.optional(),
    roundId: identifier.optional(),
    goalVersion: z.number().int().positive().optional(),
    attachmentIds: z.array(identifier).max(20).default([]),
  },
  z.object({ turn: cloudTurnSchema, run: cloudRunSchema, task: cloudTaskSchema.nullable() }),
);
export const createCloudTask = procedure(
  {
    ...project,
    ...intent,
    title: z.string().trim().min(1).max(200),
    goal: z.string().trim().min(1).max(65536),
    attachmentIds: z.array(identifier).max(20).default([]),
  },
  cloudTaskSchema,
);
export const listCloudTasks = procedure(listing, cloudPageSchema(cloudTaskSchema));
export const getCloudTask = procedure(
  { taskId: identifier },
  z.object({
    task: cloudTaskSchema,
    rounds: z.array(cloudTaskRoundSchema),
    revisions: z.array(cloudArtifactRevisionSchema),
    runs: z.array(cloudRunSchema),
  }),
);
export const updateCloudTask = procedure(
  {
    taskId: identifier,
    ...intent,
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(["cancelled", "open"]).optional(),
  },
  cloudTaskSchema,
);
export const acceptCloudRevision = procedure(
  {
    taskId: identifier,
    revisionId: identifier,
    roundId: identifier,
    goalVersion: z.number().int().positive(),
    ...intent,
  },
  cloudTaskSchema,
);
export const startCloudRound = procedure(
  {
    taskId: identifier,
    expectedGoalVersion: z.number().int().positive(),
    goal: z.string().trim().min(1).max(65536),
    attachmentIds: z.array(identifier).max(20).default([]),
    ...intent,
  },
  z.object({ task: cloudTaskSchema, round: cloudTaskRoundSchema }),
);
export const continueCloudRound = procedure(
  {
    taskId: identifier,
    roundId: identifier,
    goalVersion: z.number().int().positive(),
    conversationId: identifier,
    prompt: z.string().trim().min(1).max(65536),
    attachmentIds: z.array(identifier).max(20).default([]),
    ...intent,
  },
  z.object({
    turn: cloudTurnSchema,
    run: cloudRunSchema,
    task: cloudTaskSchema.nullable(),
    round: cloudTaskRoundSchema,
  }),
);
export const setCloudSpendingGrant = procedure(
  { projectId: identifier, userId: identifier, allowed: z.boolean(), ...intent },
  z.object({ userId: identifier, allowed: z.boolean() }),
);
export const listCloudSpendingGrants = procedure(
  { projectId: identifier },
  z.object({ items: z.array(z.object({ userId: identifier, allowed: z.boolean() })) }),
);
export const snapshotCloudRun = procedure(runKey, cloudRunSnapshotSchema);
export const historyCloudRun = procedure(
  {
    ...runKey,
    afterSequence: z.number().int().nonnegative().default(0),
    beforeSequence: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  },
  z.object({
    items: z.array(cloudRunEventSchema),
    nextSequence: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  }),
);
export const streamCloudRun = oc
  .input(z.object({ ...runKey, afterSequence: z.number().int().nonnegative().default(0) }))
  .output(eventIterator(cloudRunEventSchema));
export const createCloudCommand = procedure(
  {
    ...runKey,
    ...intent,
    type: z.enum(["cancel", "steer"]),
    text: z.string().trim().min(1).max(65536).optional(),
  },
  cloudCommandSchema,
);
export const retryCloudRun = procedure({ ...runKey, ...intent }, cloudRunSchema);
export const getCloudUsage = procedure(project, cloudUsageSummarySchema);
export const listCloudNotifications = procedure(
  { limit: z.number().int().min(1).max(100).optional() },
  z.object({
    items: z.array(cloudNotificationSchema),
    unreadCount: z.number().int().nonnegative(),
  }),
);
export const markCloudNotificationRead = procedure(
  { notificationId: identifier, ...intent },
  cloudNotificationSchema,
);
export const listCloudAssets = procedure(listing, cloudPageSchema(cloudAssetVersionSchema));
const signedUpload = z.object({
  url: z.string(),
  method: z.literal("POST"),
  fields: z.record(z.string(), z.string()),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.date(),
});
const signedDownload = z.object({
  url: z.string(),
  method: z.literal("GET"),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.date(),
});
export const createCloudUpload = procedure(
  {
    ...project,
    ...intent,
    name: z.string().trim().min(1).max(255),
    mediaType: z
      .string()
      .min(1)
      .max(200)
      .refine((value) =>
        [
          "text/csv",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/markdown",
          "text/plain",
          "application/pdf",
        ].includes(value),
      ),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  },
  z.object({ asset: cloudAssetVersionSchema, upload: signedUpload }),
);
export const completeCloudUpload = procedure({ ...assetKey, ...intent }, cloudAssetVersionSchema);
export const downloadCloudAsset = procedure(
  assetKey,
  z.object({ asset: cloudAssetVersionSchema, download: signedDownload }),
);
export const getCloudAsset = procedure(assetKey, cloudAssetVersionSchema);
export const getCloudCapabilities = procedure({}, cloudCapabilitiesSchema);
export const getCloudToolDetail = procedure({ callId: identifier }, cloudToolExecutionSchema);
export const cloudAdminRunSummarySchema = z.object({
  id: identifier,
  scope: resourceScopeSchema,
  requestedByUserId: identifier,
  taskId: identifier.nullable(),
  mode: cloudModeSchema,
  status: cloudRunStatusSchema,
  attempt: z.number().int().positive(),
  ownerId: identifier.nullable(),
  epoch: z.number().int().nonnegative(),
  lastSequence: z.number().int().nonnegative(),
  cancelRequested: z.boolean(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  failureCode: z.enum(["interrupted", "access_revoked", "execution_failed"]).nullable(),
});
export const listCloudAdminRuns = procedure(
  {
    status: cloudRunStatusSchema.optional(),
    accountId: identifier.optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().min(1).max(2048).optional(),
  },
  cloudPageSchema(cloudAdminRunSummarySchema),
);
export const inspectCloudAdminRun = procedure(
  runKey,
  z.object({
    run: cloudAdminRunSummarySchema,
    usage: z.object({
      calls: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      unknownCalls: z.number().int().nonnegative(),
      estimatedCost: z.number().nonnegative(),
    }),
  }),
);
export const getCloudAdminUsage = procedure({ accountId: identifier }, cloudUsageSummarySchema);
export const cloudContract = {
  admin: {
    runs: { list: listCloudAdminRuns, get: inspectCloudAdminRun },
    usage: { get: getCloudAdminUsage },
  },
  conversations: {
    create: createCloudConversation,
    list: listCloudConversations,
    get: getCloudConversation,
    snapshot: getCloudConversation,
    history: historyCloudConversation,
    stream: streamCloudConversation,
    sendTurn: sendCloudTurn,
  },
  tasks: {
    listSpendingGrants: listCloudSpendingGrants,
    startRound: startCloudRound,
    continueRound: continueCloudRound,
    setSpendingGrant: setCloudSpendingGrant,
    create: createCloudTask,
    list: listCloudTasks,
    get: getCloudTask,
    update: updateCloudTask,
    acceptRevision: acceptCloudRevision,
  },
  runs: {
    snapshot: snapshotCloudRun,
    history: historyCloudRun,
    stream: streamCloudRun,
    commands: { create: createCloudCommand },
    retry: retryCloudRun,
  },
  assets: {
    get: getCloudAsset,
    list: listCloudAssets,
    createUpload: createCloudUpload,
    completeUpload: completeCloudUpload,
    download: downloadCloudAsset,
    preview: downloadCloudAsset,
  },
  preferences: { get: getCloudPreferences, update: updateCloudPreferences },
  usage: { get: getCloudUsage },
  notifications: { list: listCloudNotifications, markRead: markCloudNotificationRead },
  capabilities: { get: getCloudCapabilities },
  tools: { get: getCloudToolDetail },
};
export type CloudConversationDto = z.infer<typeof cloudConversationSchema>;
export type CloudConversationSnapshotDto = z.infer<typeof cloudConversationSnapshotSchema>;
export type CloudTurnDto = z.infer<typeof cloudTurnSchema>;
export type CloudTaskDto = z.infer<typeof cloudTaskSchema>;
export type CloudTaskRoundDto = z.infer<typeof cloudTaskRoundSchema>;
export type CloudMessageDto = z.infer<typeof cloudMessageSchema>;
export type CloudRunDto = z.infer<typeof cloudRunSchema>;
export type CloudRunEventDto = z.infer<typeof cloudRunEventSchema>;
export type CloudRunSnapshotDto = z.infer<typeof cloudRunSnapshotSchema>;
export type CloudAssetVersionDto = z.infer<typeof cloudAssetVersionSchema>;
export type CloudArtifactRevisionDto = z.infer<typeof cloudArtifactRevisionSchema>;
export type CloudUsageSummaryDto = z.infer<typeof cloudUsageSummarySchema>;
export type CloudNotificationDto = z.infer<typeof cloudNotificationSchema>;
export type CloudCapabilitiesDto = z.infer<typeof cloudCapabilitiesSchema>;
export type CloudToolDetailDto = z.infer<typeof cloudToolExecutionSchema>;
export type CloudCommandDto = z.infer<typeof cloudCommandSchema>;

export type CloudPreferencesDto = z.infer<typeof cloudPreferencesSchema>;

export type CloudAdminRunSummaryDto = z.infer<typeof cloudAdminRunSummarySchema>;
