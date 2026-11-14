import { expect, it } from "vitest";
import {
  spaceComputerSchema,
  computerScreenFrameSchema,
  computerScreenInputSchema,
  computerScreenStateSchema,
  computerScreenEventSchema,
  MAX_COMPUTER_SCREEN_BYTES,
} from "./computers.js";
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
it("publishes only member-safe control state and precise stream departure reasons", () => {
  const state = {
    status: "available",
    running: true,
    width: 1024,
    height: 768,
    control: {
      id: crypto.randomUUID(),
      accountId: "member",
      displayName: "Member",
      expiresAt: new Date().toISOString(),
    },
    agentInputPaused: true,
    canForceRelease: false,
  };
  expect(computerScreenStateSchema.parse(state)).toEqual(state);
  expect(
    computerScreenStateSchema.safeParse({ ...state, supervisorUrl: "http://private.invalid" })
      .success,
  ).toBe(false);
  expect(
    computerScreenStateSchema.safeParse({
      ...state,
      control: { ...state.control, viewerId: crypto.randomUUID() },
    }).success,
  ).toBe(false);
  for (const reason of [
    "SPACE_MEMBER_REMOVED",
    "SPACE_MEMBER_LEFT",
    "SESSION_EXPIRED",
    "SCREEN_STOPPED",
    "SCREEN_IDLE_TIMEOUT",
  ])
    expect(computerScreenEventSchema.parse({ kind: "closed", reason })).toEqual({
      kind: "closed",
      reason,
    });
  expect(
    computerScreenEventSchema.safeParse({ kind: "closed", reason: "raw private error" }).success,
  ).toBe(false);
});
it("bounds untrusted image frames and screen input before transport", () => {
  expect(
    computerScreenFrameSchema.safeParse({
      sequence: 1,
      width: 1024,
      height: 768,
      mimeType: "image/png",
      bytes: "A".repeat(Math.ceil(MAX_COMPUTER_SCREEN_BYTES / 3) * 4),
    }).success,
  ).toBe(false);
  expect(
    computerScreenFrameSchema.safeParse({
      sequence: 1,
      width: 1024,
      height: 768,
      mimeType: "image/png",
      bytes: "AAAA",
    }).success,
  ).toBe(true);
  expect(
    computerScreenFrameSchema.safeParse({
      sequence: 1,
      width: 1024,
      height: 768,
      mimeType: "image/svg+xml",
      bytes: "AAAA",
    }).success,
  ).toBe(false);
  expect(
    computerScreenFrameSchema.safeParse({
      sequence: 1,
      width: 1024,
      height: 768,
      mimeType: "image/png",
      bytes: "A".repeat(Math.ceil(MAX_COMPUTER_SCREEN_BYTES / 3) * 4 + 4),
    }).success,
  ).toBe(false);
  expect(computerScreenInputSchema.parse({ kind: "pointer", x: 0, y: 0, action: "move" })).toEqual({
    kind: "pointer",
    x: 0,
    y: 0,
    action: "move",
    button: "left",
  });
  for (const input of [
    { kind: "text", text: "x\0y" },
    { kind: "text", text: "x".repeat(4097) },
    { kind: "key", key: "--shell", action: "press" },
    { kind: "pointer", x: -1, y: 0, action: "move" },
  ])
    expect(computerScreenInputSchema.safeParse(input).success).toBe(false);
});
