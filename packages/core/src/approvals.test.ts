import { expect, it } from "vitest";
import {
  approvalModeSchema,
  approvalModeInputSchema,
  approvalRuleSchema,
  toolArgumentsSchema,
  MAX_APPROVAL_ARGUMENTS,
} from "./approvals.js";
import { conversationEventSchema, runStateSchema } from "./conversation.js";

it("reserves Auto for an explicit unavailable-mode response", () => {
  expect(approvalModeInputSchema.parse("auto")).toBe("auto");
  expect(approvalModeSchema.safeParse("auto").success).toBe(false);
  expect(runStateSchema.parse("waiting")).toBe("waiting");
});

it("requires exact built-in tools and command executables", () => {
  expect(
    approvalRuleSchema.parse({
      toolName: "computer_write_file",
      executable: null,
      decision: "allow",
    }),
  ).toEqual({ toolName: "computer_write_file", executable: null, decision: "allow" });
  expect(
    approvalRuleSchema.parse({
      toolName: "computer_run_command",
      executable: "/usr/bin/git",
      decision: "block",
    }).executable,
  ).toBe("/usr/bin/git");
  for (const input of [
    { toolName: "computer_*", executable: null, decision: "allow" },
    { toolName: "computer_run_command", executable: null, decision: "allow" },
    { toolName: "computer_write_file", executable: "git", decision: "allow" },
  ])
    expect(approvalRuleSchema.safeParse(input).success).toBe(false);
});

it("bounds the exact JSON arguments and keeps full content out of card events", () => {
  expect(
    toolArgumentsSchema.safeParse({ content: "x".repeat(MAX_APPROVAL_ARGUMENTS) }).success,
  ).toBe(false);
  const card = {
    kind: "card.created",
    spaceId: "space",
    conversationId: "conversation",
    sequence: 1,
    createdAt: "2026-11-13T00:00:00.000Z",
    requestId: "request",
    runId: "run",
    toolName: "computer_write_file",
    argumentSummary: "Write 7 characters",
    target: "/workspace/result.txt",
    memberAccountId: "member",
    expiresAt: "2026-11-13T00:10:00.000Z",
  };
  expect(conversationEventSchema.parse(card)).toEqual(card);
  expect(
    conversationEventSchema.safeParse({ ...card, arguments: { content: "private" } }).success,
  ).toBe(false);
  expect(
    conversationEventSchema.safeParse({ ...card, argumentSummary: "x".repeat(1025) }).success,
  ).toBe(false);
  expect(
    conversationEventSchema.parse({
      ...card,
      kind: "card.resolved",
      outcome: "expired",
      answeredByAccountId: null,
    }),
  ).toMatchObject({ kind: "card.resolved", outcome: "expired" });
});
