import { expect, it } from "vitest";
import {
  conversationEventSchema,
  eventCursorStatus,
  memberMessageInputSchema,
} from "./conversation.js";

it("accepts only implemented immutable event variants and references message content", () => {
  const input = {
    spaceId: "space",
    conversationId: "conversation",
    sequence: 1,
    kind: "message.created",
    messageId: "message",
    createdAt: new Date().toISOString(),
  };
  const event = conversationEventSchema.parse(input);
  expect(Object.isFrozen(event)).toBe(true);
  expect(conversationEventSchema.safeParse({ ...input, kind: "run.state" }).success).toBe(false);
  expect(conversationEventSchema.safeParse({ ...input, text: "duplicate content" }).success).toBe(
    false,
  );
  for (const sequence of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(conversationEventSchema.safeParse({ ...input, sequence }).success).toBe(false);
});
it("validates member input without accepting an author chosen by the client", () => {
  expect(memberMessageInputSchema.parse({ idempotencyKey: "retry", text: "  hello  " }).text).toBe(
    "  hello  ",
  );
  for (const text of ["", "  ", "x".repeat(32_001)])
    expect(memberMessageInputSchema.safeParse({ idempotencyKey: "retry", text }).success).toBe(
      false,
    );
  expect(
    memberMessageInputSchema.safeParse({
      idempotencyKey: "retry",
      text: "hello",
      accountId: "other",
    }).success,
  ).toBe(false);
});
it("distinguishes retained boundaries, caught-up cursors and invalid future cursors", () => {
  expect(eventCursorStatus(0, 0, 0)).toBe("ready");
  expect(eventCursorStatus(4, 5, 10)).toBe("snapshot-required");
  expect(eventCursorStatus(5, 5, 10)).toBe("ready");
  expect(eventCursorStatus(10, 10, 10)).toBe("ready");
  for (const cursor of [-1, 1.5, 11, NaN])
    expect(eventCursorStatus(cursor, 0, 10)).toBe("invalid-cursor");
});
