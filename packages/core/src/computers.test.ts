import { expect, it } from "vitest";
import { spaceComputerSchema } from "./computers.js";
import { conversationEventSchema } from "./conversation.js";
it("keeps the unavailable state explicit and computer events vendor-free and bounded", () => {
  expect(spaceComputerSchema.parse({ status: "not-configured" })).toEqual({
    status: "not-configured",
  });
  const event = {
    kind: "computer.state",
    spaceId: "space",
    conversationId: "conversation",
    sequence: 1,
    createdAt: new Date().toISOString(),
    computerId: crypto.randomUUID(),
    state: "running",
    generation: 1,
    homeRevision: null,
  };
  expect(conversationEventSchema.parse(event)).toEqual(event);
  expect(conversationEventSchema.safeParse({ ...event, generation: 0 }).success).toBe(false);
  expect(conversationEventSchema.safeParse({ ...event, provider: "docker" }).success).toBe(false);
});
