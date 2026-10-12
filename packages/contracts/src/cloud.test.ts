import { describe, expect, it } from "vite-plus/test";
import {
  cloudContract,
  cloudConversationSchema,
  cloudRunEventSchema,
  resourceScopeSchema,
  cloudTaskStatusSchema,
  cloudRunStatusSchema,
} from "./cloud.js";
import { isMutationProcedure } from "./methods.js";
describe("cloud public protocol", () => {
  it("preserves native dates and rejects string timestamps", () => {
    const date = new Date("2026-10-06T00:00:00Z");
    const conversation = {
      id: "c",
      title: "Research",
      scope: { type: "personal", ownerUserId: "owner" },
      createdByUserId: "owner",
      idempotencyKey: "intent",
      createdAt: date,
      updatedAt: date,
    };
    expect(cloudConversationSchema.parse(conversation).createdAt).toBe(date);
    expect(
      cloudConversationSchema.safeParse({ ...conversation, createdAt: date.toISOString() }).success,
    ).toBe(false);
    const event = {
      runId: "run",
      sequence: 1,
      occurredAt: date,
      type: "message.completed",
      executionId: null,
      payload: { text: "Done" },
      eventId: "event",
    };
    expect(cloudRunEventSchema.parse(event).occurredAt).toBe(date);
  });
  it("has independent task and run states and mutually discriminated ownership", () => {
    expect(cloudTaskStatusSchema.options).toContain("review");
    expect(cloudRunStatusSchema.options).toContain("needs_input");
    expect(cloudRunStatusSchema.options).not.toContain("completed");
    expect(resourceScopeSchema.safeParse({ type: "personal", projectId: "project" }).success).toBe(
      false,
    );
    expect(resourceScopeSchema.parse({ type: "project", projectId: "p" })).toEqual({
      type: "project",
      projectId: "p",
    });
  });
  it("classifies every new mutation as POST and keeps subscriptions separate", () => {
    for (const name of [
      "sendTurn",
      "startRound",
      "continueRound",
      "setSpendingGrant",
      "acceptRevision",
      "markRead",
      "createUpload",
      "completeUpload",
      "create",
      "update",
      "retry",
    ])
      expect(isMutationProcedure(["cloud", "feature", name])).toBe(true);
    for (const name of ["stream", "history", "snapshot", "get", "list", "preview", "download"])
      expect(isMutationProcedure(["cloud", "feature", name])).toBe(false);
    expect(cloudContract.conversations.stream).toBeDefined();
    expect(cloudContract.runs.stream).toBeDefined();
    expect(cloudContract.tools.get).toBeDefined();
  });
});
