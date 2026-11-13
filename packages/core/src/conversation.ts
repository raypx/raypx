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
import { approvalCardFields } from "./approvals.js";

export { runIdSchema } from "./run-identity.js";

export const eventSequenceSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const messageIdSchema = z.string().min(1).max(128).brand<"MessageId">();
export const memberMessageInputSchema = z.strictObject({
  idempotencyKey: z.string().min(1).max(128),
  text: z
    .string()
    .min(1)
    .max(32_000)
    .refine((text) => text.trim().length > 0),
});
export type MemberMessageInput = z.infer<typeof memberMessageInputSchema>;
export const messageSchema = z.strictObject({
  id: messageIdSchema,
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  sequence: eventSequenceSchema,
  author: z.strictObject({ kind: z.literal("member"), accountId: z.string().min(1).max(128) }),
  text: memberMessageInputSchema.shape.text,
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;
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
    trigger: z.literal("message"),
    messageId: messageIdSchema,
    memberAccountId: z.string().min(1).max(128),
    model: agentModelChoiceSchema,
    state: runStateSchema,
    failureCode: runFailureSchema.nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    firstResponseAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .refine(
    (run) => (run.state === "failed") === (run.failureCode !== null),
    "Failed Runs require a stable failure code",
  );
export type Run = z.infer<typeof runSchema>;
export type RunId = z.infer<typeof runIdSchema>;
export type RunFailure = z.infer<typeof runFailureSchema>;
export const MAX_REPLY_TEXT = 32_000;
export const replySegmentSchema = z.strictObject({
  id: z.string().min(1).max(128),
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  runId: runIdSchema,
  sequence: eventSequenceSchema,
  text: z.string().min(1).max(MAX_REPLY_TEXT),
  createdAt: z.iso.datetime(),
});
export type ReplySegment = z.infer<typeof replySegmentSchema>;
const eventFields = {
  spaceId: spaceIdSchema,
  conversationId: conversationIdSchema,
  sequence: eventSequenceSchema,
  createdAt: z.iso.datetime(),
};
export const toolOutcomeSchema = z.enum(["succeeded", "failed", "refused", "cancelled", "unknown"]);
export const toolLifecycleFields = {
  runId: runIdSchema,
  toolCallId: z.string().min(1).max(128),
  toolName: z.string().min(1).max(128),
  target: z.string().min(1).max(1_024),
  argumentSummary: z.string().max(1_024),
};
export const toolActivitySchema = z.strictObject({
  ...toolLifecycleFields,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  outcome: toolOutcomeSchema.nullable(),
  durationMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  exitStatus: z.number().int().nullable(),
});
export type ToolActivity = z.infer<typeof toolActivitySchema>;
export type ToolOutcome = z.infer<typeof toolOutcomeSchema>;
export const conversationEventSchema = z
  .discriminatedUnion("kind", [
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
      state: runStateSchema,
      failureCode: runFailureSchema.nullable(),
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
  text: z.string().max(MAX_REPLY_TEXT),
});
export type LiveReply = z.infer<typeof liveReplySchema>;

/** retainedAfter is the greatest sequence removed from the log, including an empty log. */
export function eventCursorStatus(cursor: number, retainedAfter: number, latest: number) {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > latest) return "invalid-cursor";
  if (cursor < retainedAfter) return "snapshot-required";
  return "ready";
}

export class InvalidConversationCursor extends Error {
  constructor() {
    super("Invalid conversation cursor");
    this.name = "InvalidConversationCursor";
  }
}
