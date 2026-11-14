import { vi } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import { routineSchema } from "@raypx/core/routines";
import { spaceMemoryDocumentSchema } from "@raypx/core/space-memory";
import type { RoutinesPort } from "@raypx/jobs/model";
import type { SpaceMemoryClientPort } from "@raypx/memory/model";

export const spaceId = spaceIdSchema.parse("space-one");
export const agentId = agentIdSchema.parse("agent-one");
export const date = "2026-11-14T00:00:00.000Z";
export const routine = routineSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  spaceId,
  agentId,
  ownerAccountId: "account",
  name: "Morning",
  prompt: "Read news",
  enabled: true,
  triggers: { schedule: { cron: "0 9 * * 1-5", timezone: "Asia/Shanghai" }, webhook: true },
  emailAddress: null,
  nextDueAt: date,
  createdAt: date,
  updatedAt: date,
  ingress: {
    webhook: { url: "https://api.example.test/routines/incoming", unavailableReason: null },
    repository: { url: null, unavailableReason: "TRIGGER_NOT_CONFIGURED" },
    email: { address: null, unavailableReason: "TRIGGER_NOT_CONFIGURED" },
  },
});
export const memory = spaceMemoryDocumentSchema.parse({
  id: "memory-one",
  spaceId,
  agentId,
  scope: "agent",
  title: "Notes",
  text: "# Important",
  pinned: false,
  attribution: { speaker: null, source: null },
  provenance: { kind: "member", accountId: "account", runId: null, untrustedInput: false },
  revision: 1,
  removed: false,
  createdAt: date,
  updatedAt: date,
});
export function routinePort() {
  return {
    list: vi.fn(async () => [routine]),
    get: vi.fn(async () => routine),
    create: vi.fn<RoutinesPort["create"]>(async (input) => ({
      routine: { ...routine, ...input.routine },
      webhookKey: null,
      repositorySecret: null,
    })),
    update: vi.fn<RoutinesPort["update"]>(async (input) => ({
      routine: { ...routine, ...input.routine },
      webhookKey: null,
      repositorySecret: null,
    })),
    pause: vi.fn(async () => ({ ...routine, enabled: false })),
    resume: vi.fn(async () => routine),
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({
      status: "fired" as const,
      runId: "run-one",
      conversationId: "conversation-one",
    })),
    rotateWebhookKey: vi.fn(async () => ({ routine, webhookKey: "test-key" })),
    history: vi.fn(async () => []),
    events: vi.fn(async () => []),
  } satisfies RoutinesPort;
}
export function memoryPort() {
  return {
    list: vi.fn<SpaceMemoryClientPort["list"]>(async (input) =>
      input.scope === "space" ? [] : [memory],
    ),
    get: vi.fn(async () => ({ ...memory, revision: 2 })),
    create: vi.fn(async (input) => ({ ...memory, ...input.document })),
    update: vi.fn(async (input) => ({
      ...memory,
      ...input.document,
      revision: input.expectedRevision + 1,
    })),
    remove: vi.fn(async () => ({ ...memory, removed: true, text: null, revision: 2 })),
    history: vi.fn(async () => [{ ...memory, reason: "created" as const }]),
    restore: vi.fn(async () => ({ ...memory, revision: 3 })),
  } satisfies SpaceMemoryClientPort;
}
