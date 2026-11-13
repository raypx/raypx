import { computerSchema, type Computer, type SpaceComputer } from "@raypx/core/computers";
import { conversationIdSchema } from "@raypx/core/agents";
import type { ConversationEvent } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";

export const computerSpaceId = spaceIdSchema.parse("computer-space");
export const computerConversationId = conversationIdSchema.parse("computer-conversation");
export const computerTime = "2026-11-13T03:00:00.000Z";

export function computerRecord(state: Computer["state"] = "stopped"): Computer {
  return computerSchema.parse({
    id: "313d52c6-12f7-4c38-a0c9-6338948d6b85",
    spaceId: computerSpaceId,
    scope: "team",
    agentId: null,
    provider: "memory",
    state,
    generation: 1,
    homeRevision: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    leaseFence: 0,
    failureCode: state === "failed" ? "PROVIDER_UNAVAILABLE" : null,
    createdAt: computerTime,
    updatedAt: computerTime,
  });
}

export function computerResult(state: Computer["state"] = "stopped"): SpaceComputer {
  return { status: "available", computer: computerRecord(state) };
}

export function computerEvent(
  state: Computer["state"],
  sequence = 1,
): Extract<ConversationEvent, { kind: "computer.state" }> {
  return {
    kind: "computer.state",
    computerId: computerRecord().id,
    spaceId: computerSpaceId,
    conversationId: computerConversationId,
    sequence,
    state,
    generation: 1,
    homeRevision: null,
    createdAt: computerTime,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
