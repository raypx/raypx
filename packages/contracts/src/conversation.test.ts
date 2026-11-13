import { expect, it } from "vitest";
import { apiContract, conversationClientFrameSchema, getRpcAccess } from "./api.js";

it("admits conversation operations only with a session and rejects forged scope or author", async () => {
  for (const procedure of Object.values(apiContract.conversations))
    expect(getRpcAccess(procedure)).toBe("session");
  const schema = apiContract.conversations.send["~orpc"].inputSchemas![0]!;
  const input = {
    spaceId: "space",
    conversationId: "conversation",
    message: { text: "Hello", idempotencyKey: "retry" },
  };
  expect((await schema["~standard"].validate(input)).issues).toBeUndefined();
  for (const forged of [
    { accountId: "other" },
    { scope: { spaceId: "other" } },
    { message: { ...input.message, author: "other" } },
  ])
    expect((await schema["~standard"].validate({ ...input, ...forged })).issues).toBeDefined();
});
it("requires the current stream version and bounded acknowledged cursors", () => {
  const frame = {
    version: 1,
    type: "subscribe",
    spaceId: "space",
    conversationId: "conversation",
    after: 0,
  };
  expect(conversationClientFrameSchema.safeParse(frame).success).toBe(true);
  for (const change of [
    { version: 2 },
    { version: undefined },
    { after: -1 },
    { after: Number.MAX_SAFE_INTEGER + 1 },
  ])
    expect(conversationClientFrameSchema.safeParse({ ...frame, ...change }).success).toBe(false);
});
