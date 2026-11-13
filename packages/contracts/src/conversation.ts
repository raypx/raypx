import { oc } from "@orpc/contract";
import { z } from "zod";
import { conversationIdSchema, conversationSchema } from "@raypx/core/agents";
import {
  conversationEventSchema,
  toolActivitySchema,
  runSchema,
  runIdSchema,
  replySegmentSchema,
  liveReplySchema,
  memberMessageInputSchema,
  messageSchema,
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
  segments: z.array(replySegmentSchema),
  toolActivity: z.array(toolActivitySchema).max(100).optional(),
  toolActivityTruncated: z.boolean().optional(),
  cursor,
});
const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
export const conversationsContract = {
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
};
const streamSelection = selection.extend({ version: z.literal(1) });
export const conversationClientFrameSchema = z.discriminatedUnion("type", [
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
