import { z } from "zod";
import { conversationIdSchema } from "./agents.js";
import { spaceIdSchema } from "./spaces.js";

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
// Add variants here only when their writer ships. Events reference the one stored message.
export const conversationEventSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      spaceId: spaceIdSchema,
      conversationId: conversationIdSchema,
      sequence: eventSequenceSchema,
      kind: z.literal("message.created"),
      messageId: messageIdSchema,
      createdAt: z.iso.datetime(),
    }),
  ])
  .readonly();
export type ConversationEvent = z.infer<typeof conversationEventSchema>;

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
