import { z } from "zod";
import {
  computerIdSchema,
  computerStateSchema,
  computerGenerationSchema,
  homeRevisionSchema,
} from "./computers.js";
import { agentIdSchema, agentModelChoiceSchema, conversationIdSchema } from "./agents.js";
import { spaceIdSchema } from "./spaces.js";
import { runIdSchema } from "./run-identity.js";
import { approvalCardFields, approvalReviewSchema } from "./approvals.js";
import { pageIdSchema, pageSchema } from "./pages.js";

export { runIdSchema } from "./run-identity.js";

export const eventSequenceSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const messageIdSchema = z.string().min(1).max(128).brand<"MessageId">();
export const MAX_MESSAGE_ATTACHMENTS = 4;
export const MESSAGE_ATTACHMENT_CHUNK_BYTES = 96 * 1024;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 1024 * 1024;
export const attachmentIdSchema = z.uuid();
export const attachmentNameSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[^\p{Cc}\p{Cf}\p{Cs}/\\]+$/u);
export const attachmentMediaTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);
export const attachmentDeliverySchema = z.strictObject({
  runId: runIdSchema,
  state: z.enum(["image", "available", "withheld"]),
  path: z.string().max(4096).nullable(),
  reason: z
    .enum([
      "MODEL_IMAGES_UNAVAILABLE",
      "COMPUTER_UNAVAILABLE",
      "DEVICE_GRANT_REQUIRED",
      "DELIVERY_UNCONFIRMED",
    ])
    .nullable(),
});
export const messageAttachmentSchema = z.strictObject({
  id: attachmentIdSchema,
  name: attachmentNameSchema,
  mediaType: attachmentMediaTypeSchema,
  size: z.number().int().min(1).max(MAX_MESSAGE_ATTACHMENT_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
  deliveries: z.array(attachmentDeliverySchema).max(32).optional(),
});
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;
export type AttachmentDelivery = z.infer<typeof attachmentDeliverySchema>;
export const memberMessageInputSchema = z
  .strictObject({
    idempotencyKey: z.string().min(1).max(128),
    mentions: z.array(agentIdSchema).max(32).optional(),
    steerRunId: runIdSchema.optional(),
    attachmentIds: z
      .array(attachmentIdSchema)
      .max(MAX_MESSAGE_ATTACHMENTS)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    text: z.string().max(32_000),
  })
  .refine(
    (input) => input.text.trim().length > 0 || Boolean(input.attachmentIds?.length),
    "A message needs text or attachments",
  )
  .refine((input) => !input.steerRunId || !input.mentions?.length, "Steering addresses one Run");
export type MemberMessageInput = z.infer<typeof memberMessageInputSchema>;
export const messageSchema = z.strictObject({
  id: messageIdSchema,
  /** Send reconciliation receipt, projected only to the originating member. */
  idempotencyKey: z.string().min(1).max(128).optional(),
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  sequence: eventSequenceSchema,
  author: z.strictObject({
    kind: z.enum(["member", "agent"]),
    accountId: z.string().min(1).max(128),
    agentId: agentIdSchema.optional(),
  }),
  mentions: z.array(agentIdSchema).optional(),
  attachments: z.array(messageAttachmentSchema).max(MAX_MESSAGE_ATTACHMENTS).optional(),
  text: memberMessageInputSchema.shape.text,
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;
export const conversationMemberSchema = z.strictObject({
  accountId: z.string().min(1).max(128),
  displayName: z.string().max(200),
  isMember: z.boolean(),
});
export type ConversationMember = z.infer<typeof conversationMemberSchema>;
export const resolvedApprovalSummarySchema = z.strictObject({
  requestId: z.string().min(1).max(128),
  runId: runIdSchema,
  toolCallId: z.string().min(1).max(128),
  outcome: z.enum(["approved", "denied", "expired", "cancelled"]),
  answeredByAccountId: z.string().min(1).max(128).nullable(),
  resolvedAt: z.iso.datetime(),
  review: approvalReviewSchema.optional(),
});
export type ResolvedApprovalSummary = z.infer<typeof resolvedApprovalSummarySchema>;
/** A history boundary, independent of the event replay/ACK cursor. */
export const conversationHistoryCursorSchema = z.strictObject({
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  beforeSequence: eventSequenceSchema,
});
export type ConversationHistoryCursor = z.infer<typeof conversationHistoryCursorSchema>;
export const runStateSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "cancelled",
]);
export const runFailureSchema = z.enum([
  "MODEL_UNAVAILABLE",
  "MODEL_NOT_CONFIGURED",
  "MODEL_AUTH_REQUIRED",
  "MODEL_RATE_LIMITED",
  "MODEL_TIMEOUT",
  "MODEL_FAILED",
  "REPLY_TOO_LARGE",
  "EXECUTION_FAILED",
  "TOOL_ROUND_LIMIT",
  "EFFECT_UNKNOWN",
  "CONNECTION_UNAVAILABLE",
  "COMPUTER_UNAVAILABLE",
]);
export const runSchema = z
  .strictObject({
    id: runIdSchema,
    spaceId: spaceIdSchema,
    conversationId: conversationIdSchema,
    agentId: agentIdSchema,
    trigger: z.enum(["message", "routine", "webhook", "email", "agent"]),
    parentRunId: runIdSchema.nullable().optional(),
    messageId: messageIdSchema,
    memberAccountId: z.string().min(1).max(128),
    model: agentModelChoiceSchema,
    state: runStateSchema,
    failureCode: runFailureSchema.nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    firstResponseAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    routineId: z.string().min(1).max(128).nullable().optional(),
    routineDueAt: z.iso.datetime().nullable().optional(),
    routineTimezone: z.string().nullable().optional(),
    untrustedInput: z.boolean().optional(),
    computerInputPaused: z.boolean().optional(),
    inboundProvenance: z
      .strictObject({
        kind: z.enum(["webhook", "email", "repository"]),
        routineId: z.string().min(1).max(128),
        deliveryId: z.string().min(1).max(200),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (run) => (run.state === "failed") === (run.failureCode !== null),
    "Failed Runs require a stable failure code",
  );
export type Run = z.infer<typeof runSchema>;
export type RunId = z.infer<typeof runIdSchema>;
export type RunFailure = z.infer<typeof runFailureSchema>;
/** Bounded command projection independent of the loaded message window. */
export const pendingApprovalSummarySchema = z.strictObject({
  ...approvalCardFields,
  createdAt: z.iso.datetime(),
});
export type PendingApprovalSummary = z.infer<typeof pendingApprovalSummarySchema>;
export const MAX_ACTIVE_CONVERSATION_RUNS = 100;
export const MAX_ACTIVE_RUN_APPROVALS = 16;
export const activeRunSchema = z
  .strictObject({
    run: runSchema.refine((run) => ["queued", "running", "waiting"].includes(run.state)),
    triggerMessage: z.strictObject({ id: messageIdSchema, sequence: eventSequenceSchema }),
    pendingApprovals: z.array(pendingApprovalSummarySchema).max(MAX_ACTIVE_RUN_APPROVALS),
    pendingApprovalsTruncated: z.boolean(),
    latestCommittedSegment: z
      .strictObject({
        id: z.string().min(1).max(128),
        sequence: eventSequenceSchema,
      })
      .nullable(),
  })
  .refine(
    (item) =>
      item.triggerMessage.id === item.run.messageId &&
      item.pendingApprovals.every((approval) => approval.runId === item.run.id),
    "Active Run references must match their Run",
  );
export type ActiveRun = z.infer<typeof activeRunSchema>;

export const MAX_REPLY_TEXT = 32_000;
export const replySegmentSchema = z.strictObject({
  id: z.string().min(1).max(128),
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  runId: runIdSchema,
  agentId: agentIdSchema.optional(),
  parentRunId: runIdSchema.nullable().optional(),
  sequence: eventSequenceSchema,
  text: z.string().min(1).max(MAX_REPLY_TEXT),
  createdAt: z.iso.datetime(),
});
export type ReplySegment = z.infer<typeof replySegmentSchema>;
const eventFields = {
  agentId: agentIdSchema.optional(),
  parentRunId: runIdSchema.nullable().optional(),
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  sequence: eventSequenceSchema,
  createdAt: z.iso.datetime(),
};
export const toolOutcomeSchema = z.enum(["succeeded", "failed", "refused", "cancelled", "unknown"]);
/** Historical identity of the Page version produced by a successful server operation. */
export const toolPageSchema = z.strictObject({
  id: pageIdSchema,
  version: pageSchema.shape.version,
});
export type ToolPage = z.infer<typeof toolPageSchema>;
/** Only bounded public source details are projected to members. */
export const webSourceUrlSchema = z
  .url()
  .max(1024)
  .regex(/^https?:\/\/[^/?#@\\\s]+(?:[/?][^#\\\s]*)?$/);
export const webSourcesSchema = z
  .array(
    z.strictObject({
      url: webSourceUrlSchema,
      title: z.string().min(1).max(120),
      excerpt: z.string().max(360),
    }),
  )
  .max(5);
export type WebSources = z.infer<typeof webSourcesSchema>;
const forecastCodeSchema = z.number().int().min(0).max(99).nullable();
const forecastTemperatureSchema = z.number().min(-120).max(80).nullable();
const rainProbabilitySchema = z.number().int().min(0).max(100).nullable();
/** Bounded local-day forecast; provider payloads and coordinates stay private. */
export const weatherForecastSchema = z.strictObject({
  place: z.string().min(1).max(360),
  date: z.iso.date(),
  code: forecastCodeSchema,
  low: forecastTemperatureSchema,
  high: forecastTemperatureSchema,
  rain: rainProbabilitySchema,
  hourly: z
    .array(
      z.strictObject({
        time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        code: forecastCodeSchema,
        temperature: forecastTemperatureSchema,
        rain: rainProbabilitySchema,
      }),
    )
    .max(25),
});
export type WeatherForecast = z.infer<typeof weatherForecastSchema>;

const workspaceResultPath = z.string().min(1).max(1024);
export const MAX_COMPUTER_FILE_RESULT_BYTES = 7_000;
export const computerFileResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("search"),
    matches: z
      .array(
        z.strictObject({
          path: workspaceResultPath,
          line: z.number().int().positive(),
          text: z.string().max(240),
        }),
      )
      .max(24),
    truncated: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("edit"),
    path: workspaceResultPath,
    hunks: z
      .array(
        z.strictObject({
          oldStart: z.number().int().nonnegative(),
          newStart: z.number().int().nonnegative(),
          lines: z
            .array(
              z
                .string()
                .max(401)
                .regex(/^(?:[ +-]|\\ No newline at end of file$)/),
            )
            .min(1)
            .max(80),
        }),
      )
      .min(1)
      .max(8),
    truncated: z.boolean(),
  }),
]);
export type ComputerFileResult = z.infer<typeof computerFileResultSchema>;
export const toolLifecycleFields = {
  runId: runIdSchema,
  toolCallId: z.string().min(1).max(128),
  toolName: z.string().min(1).max(128),
  target: z.string().min(1).max(1_024),
  argumentSummary: z.string().max(1_024),
};
export const toolActivitySchema = z.strictObject({
  ...toolLifecycleFields,
  agentId: agentIdSchema.optional(),
  parentRunId: runIdSchema.nullable().optional(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  outcome: toolOutcomeSchema.nullable(),
  durationMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  exitStatus: z.number().int().nullable(),
  page: toolPageSchema.nullable().optional(),
  webSources: webSourcesSchema.optional(),
  weatherForecast: weatherForecastSchema.optional(),
  fileResult: computerFileResultSchema.optional(),
});
export type ToolActivity = z.infer<typeof toolActivitySchema>;
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;
export const conversationEventSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...eventFields,
      kind: z.literal("attachment.state"),
      messageId: messageIdSchema,
      attachmentId: attachmentIdSchema,
      delivery: attachmentDeliverySchema,
    }),
    z.strictObject({
      ...eventFields,
      ...toolLifecycleFields,
      kind: z.literal("tool.started"),
    }),
    z.strictObject({
      ...eventFields,
      ...toolLifecycleFields,
      kind: z.literal("tool.finished"),
      outcome: toolOutcomeSchema,
      durationMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      exitStatus: z.number().int().nullable(),
      page: toolPageSchema.nullable().optional(),
      webSources: webSourcesSchema.optional(),
      weatherForecast: weatherForecastSchema.optional(),
      fileResult: computerFileResultSchema.optional(),
    }),
    z.strictObject({
      ...eventFields,
      ...approvalCardFields,
      kind: z.literal("card.created"),
    }),
    z.strictObject({
      ...eventFields,
      ...approvalCardFields,
      kind: z.literal("card.resolved"),
      review: approvalReviewSchema.optional(),
      outcome: z.enum(["approved", "denied", "expired", "cancelled"]),
      answeredByAccountId: z.string().min(1).max(128).nullable(),
    }),
    z.strictObject({
      ...eventFields,
      kind: z.literal("computer.state"),
      computerId: computerIdSchema,
      state: computerStateSchema,
      generation: computerGenerationSchema,
      homeRevision: homeRevisionSchema.nullable(),
    }),
    z.strictObject({
      ...eventFields,
      kind: z.literal("message.created"),
      messageId: messageIdSchema,
    }),
    z.strictObject({
      ...eventFields,
      kind: z.literal("run.state"),
      runId: runIdSchema,
      triggerMessage: z
        .strictObject({ id: messageIdSchema, sequence: eventSequenceSchema })
        .optional(),
      state: runStateSchema,
      failureCode: runFailureSchema.nullable(),
      trigger: runSchema.shape.trigger.optional(),
      routineId: z.string().min(1).max(128).nullable().optional(),
      provenanceKind: z.enum(["webhook", "email", "repository"]).nullable().optional(),
      untrustedInput: z.boolean().optional(),
      computerInputPaused: z.boolean().optional(),
    }),
    z.strictObject({
      ...eventFields,
      kind: z.literal("reply.segment"),
      segment: replySegmentSchema,
    }),
  ])
  .readonly();
export type ConversationEvent = z.infer<typeof conversationEventSchema>;

// Transient replacement prefix followed by offset-addressed appends; never advances a cursor.
export const liveReplySchema = z.strictObject({
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  runId: runIdSchema,
  segmentId: z.string().min(1).max(128),
  agentId: agentIdSchema.optional(),
  parentRunId: runIdSchema.nullable().optional(),
  text: z.string().max(MAX_REPLY_TEXT),
});
export type LiveReply = z.infer<typeof liveReplySchema>;

/** retainedAfter is the greatest sequence removed from the log, including an empty log. */
export function eventCursorStatus(cursor: number, retainedAfter: number, latest: number) {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > latest) return "invalid-cursor";
  if (cursor < retainedAfter) return "snapshot-required";
  return "ready";
}

export class ConversationSteeringError extends Error {
  readonly code = "RUN_NOT_ACTIVE";
  constructor() {
    super("RUN_NOT_ACTIVE");
    this.name = "ConversationSteeringError";
  }
}

export class InvalidConversationCursor extends Error {
  constructor() {
    super("Invalid conversation cursor");
    this.name = "InvalidConversationCursor";
  }
}

export class AgentMessageError extends Error {
  constructor(
    readonly code:
      | "AGENT_MESSAGE_CROSS_SPACE_DISABLED"
      | "AGENT_MESSAGE_CROSS_SPACE_UNSUPPORTED"
      | "AGENT_MESSAGE_TARGET_INVALID"
      | "AGENT_MESSAGE_DEPTH_LIMIT"
      | "AGENT_MESSAGE_BUDGET_LIMIT",
  ) {
    super(code);
    this.name = "AgentMessageError";
  }
}
export const MAX_AGENT_MESSAGE_DEPTH = 4;
export const MAX_AGENT_MESSAGE_RUNS = 16;
export const GROUP_HISTORY_BUDGET = 64_000;
