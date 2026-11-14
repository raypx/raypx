import { oc } from "@orpc/contract";
import { z } from "zod";
import { computerScreenEventSchema } from "@raypx/core/computers";
import {
  agentIdSchema,
  groupConversationInputSchema,
  conversationIdSchema,
  conversationSchema,
} from "@raypx/core/agents";
import {
  conversationEventSchema,
  toolActivitySchema,
  runSchema,
  activeRunSchema,
  MAX_ACTIVE_CONVERSATION_RUNS,
  runIdSchema,
  replySegmentSchema,
  liveReplySchema,
  memberMessageInputSchema,
  messageSchema,
  conversationMemberSchema,
  resolvedApprovalSummarySchema,
  conversationHistoryCursorSchema,
} from "@raypx/core/conversation";
import { spaceEventSchema, spaceIdSchema } from "@raypx/core/spaces";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const cursor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const selection = z.strictObject({ spaceId: spaceIdSchema, conversationId: conversationIdSchema });
const entry = z
  .strictObject({ event: conversationEventSchema, message: messageSchema.optional() })
  .refine(
    (value) => (value.event.kind === "message.created") === (value.message !== undefined),
    "Only message.created requires a hydrated message",
  );
export const conversationEventsSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("events"),
    events: z.array(entry).max(100),
    cursor,
    hasMore: z.boolean(),
  }),
  z.strictObject({ status: z.literal("snapshot-required"), cursor }),
]);
export const conversationSnapshotSchema = z.strictObject({
  conversation: conversationSchema,
  messages: z.array(messageSchema),
  runs: z.array(runSchema),
  activeRuns: z.array(activeRunSchema).max(MAX_ACTIVE_CONVERSATION_RUNS).optional(),
  activeRunsTruncated: z.boolean().optional(),
  segments: z.array(replySegmentSchema),
  toolActivity: z.array(toolActivitySchema).max(100).optional(),
  toolActivityTruncated: z.boolean().optional(),
  participants: z.array(conversationMemberSchema).max(100).optional(),
  participantsTruncated: z.boolean().optional(),
  resolvedApprovals: z.array(resolvedApprovalSummarySchema).max(100).optional(),
  resolvedApprovalsTruncated: z.boolean().optional(),
  cursor,
});
const conversationHistorySchema = conversationSnapshotSchema.extend({
  messages: z.array(messageSchema).max(100),
  runs: z.array(runSchema).max(500),
  segments: z.array(replySegmentSchema).max(500),
  olderCursor: conversationHistoryCursorSchema.nullable(),
  runsTruncated: z.boolean(),
  segmentsTruncated: z.boolean(),
});
const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
export const conversationsContract = {
  createGroup: session
    .input(groupConversationInputSchema.extend({ spaceId: spaceIdSchema }))
    .output(conversationSchema),
  listGroups: session
    .input(
      z.strictObject({
        spaceId: spaceIdSchema,
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .output(z.array(conversationSchema)),
  getGroup: session.input(selection).output(conversationSchema),
  renameGroup: session
    .input(selection.extend({ name: groupConversationInputSchema.shape.name }))
    .output(conversationSchema),
  addGroupAgent: session
    .input(selection.extend({ agentId: agentIdSchema }))
    .output(conversationSchema),
  removeGroupAgent: session
    .input(selection.extend({ agentId: agentIdSchema }))
    .output(conversationSchema),
  setGroupDefaultResponder: session
    .input(selection.extend({ agentId: agentIdSchema.nullable() }))
    .output(conversationSchema),
  deleteGroup: session.input(selection).output(z.strictObject({ deleted: z.literal(true) })),
  stop: session.input(selection.extend({ runId: runIdSchema })).output(runSchema),
  send: session
    .input(selection.extend({ message: memberMessageInputSchema }))
    .output(messageSchema),
  events: session
    .input(
      selection.extend({
        after: cursor.default(0),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .output(conversationEventsSchema),
  snapshot: session.input(selection).output(conversationSnapshotSchema),
  history: session
    .input(
      selection.extend({
        limit: z.number().int().min(1).max(100).default(50),
        before: conversationHistoryCursorSchema.optional(),
      }),
    )
    .output(conversationHistorySchema),
};
const streamSelection = selection.extend({ version: z.literal(1) });
const screenSelection = z.strictObject({
  version: z.literal(1),
  spaceId: spaceIdSchema,
  viewerId: z.uuid(),
});
export const conversationClientFrameSchema = z.discriminatedUnion("type", [
  screenSelection.extend({ type: z.literal("screen.subscribe") }),
  screenSelection.extend({ type: z.literal("screen.unsubscribe") }),
  screenSelection.extend({ type: z.literal("screen.ack"), sequence: cursor }),
  streamSelection.extend({ type: z.literal("subscribe"), after: cursor }),
  streamSelection.extend({ type: z.literal("ack"), sequence: cursor }),
  streamSelection.extend({ type: z.literal("unsubscribe") }),
  z.strictObject({
    version: z.literal(1),
    type: z.literal("space.subscribe"),
    spaceId: spaceIdSchema,
    after: cursor,
  }),
  z.strictObject({
    version: z.literal(1),
    type: z.literal("space.ack"),
    spaceId: spaceIdSchema,
    sequence: cursor,
  }),
  z.strictObject({
    version: z.literal(1),
    type: z.literal("space.unsubscribe"),
    spaceId: spaceIdSchema,
  }),
]);
export type ConversationClientFrame = z.infer<typeof conversationClientFrameSchema>;
export const conversationServerFrameSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("screen.event"),
    spaceId: spaceIdSchema,
    viewerId: z.uuid(),
    sequence: cursor,
    event: computerScreenEventSchema,
    conversationId: z.never().optional(),
  }),
  z.strictObject({
    type: z.literal("space.event"),
    spaceId: spaceIdSchema,
    conversationId: z.never().optional(),
    event: spaceEventSchema,
  }),
  liveReplySchema.extend({ type: z.literal("reply.prefix"), offset: z.literal(0) }),
  liveReplySchema.extend({
    type: z.literal("reply.delta"),
    offset: z.number().int().min(0).max(32_000),
  }),
  z.strictObject({ type: z.literal("ready"), version: z.literal(1) }),
  z.strictObject({ type: z.literal("event"), entry }),
  selection.extend({ type: z.literal("snapshot-required"), cursor }),
]);
export type ConversationServerFrame = z.infer<typeof conversationServerFrameSchema>;
export const MAX_CONVERSATION_FRAME_BYTES = 256_000;
/** Screens travel one acknowledged frame at a time, including their bounded base64 envelope. */
export const MAX_SCREEN_STREAM_FRAME_BYTES = 1_500_000;
