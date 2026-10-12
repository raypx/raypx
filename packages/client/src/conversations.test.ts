import { describe, expect, it } from "vite-plus/test";
import type { CloudConversationSnapshotDto } from "@voidmix/contracts";
import { createConversationSession, type ConversationTransport } from "./conversations.js";
const now = new Date("2026-10-06T00:00:00Z");
function snapshot(id = "conversation-a"): CloudConversationSnapshotDto {
  return {
    conversation: {
      id,
      title: "Question",
      scope: { type: "personal", ownerUserId: "account-a" },
      createdByUserId: "account-a",
      idempotencyKey: "create-a",
      createdAt: now,
      updatedAt: now,
    },
    turns: [],
    runs: [],
    historyCursor: null,
  };
}
function block(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
describe("conversation scope and lifecycle", () => {
  it("consumes the route bootstrap once and refreshes without reopening the stream", async () => {
    let reads = 0;
    let streams = 0;
    const s = createConversationSession({
      conversationId: "conversation-a",
      initialSnapshot: snapshot(),
      transport: {
        snapshot: async () => {
          reads++;
          return snapshot();
        },
        history: async () => ({ items: [], runs: [], nextCursor: null }),
        stream: async (signal) => {
          streams++;
          return (async function* () {
            yield snapshot();
            await block(signal);
          })();
        },
      },
    });
    s.reconnect();
    await expect.poll(() => streams).toBe(1);
    expect(reads).toBe(0);
    s.refresh();
    s.refresh();
    await expect.poll(() => reads).toBe(1);
    expect(streams).toBe(1);
    s.dispose();
  });
  it("constructs without I/O and isolates simultaneous account-owned sessions", async () => {
    let reads = 0;
    const makeTransport = (id: string): ConversationTransport => ({
      history: async () => ({ items: [], runs: [], nextCursor: null }),
      snapshot: async () => {
        reads++;
        return snapshot(id);
      },
      stream: async (signal) =>
        (async function* () {
          await block(signal);
        })(),
    });
    const a = createConversationSession({
      conversationId: "conversation-a",
      transport: makeTransport("conversation-a"),
    });
    const b = createConversationSession({
      conversationId: "conversation-b",
      transport: makeTransport("conversation-b"),
    });
    expect(reads).toBe(0);
    expect(a.getSnapshot()).toBe(a.getSnapshot());
    a.reconnect();
    b.reconnect();
    await expect.poll(() => reads).toBe(2);
    expect(a.getSnapshot().data?.conversation.id).toBe("conversation-a");
    expect(b.getSnapshot().data?.conversation.id).toBe("conversation-b");
    a.dispose();
    b.dispose();
  });
  it("rejects an SSE projection from a different resource", async () => {
    const s = createConversationSession({
      conversationId: "conversation-a",
      transport: {
        history: async () => ({ items: [], runs: [], nextCursor: null }),
        snapshot: async () => snapshot(),
        stream: async () =>
          (async function* () {
            yield snapshot("other");
          })(),
      },
    });
    s.reconnect();
    await expect.poll(() => s.getSnapshot().connection).toBe("failed");
    expect(s.getSnapshot().data?.conversation.id).toBe("conversation-a");
    s.dispose();
  });
  it("rejects stale responses after the account-scoped owner disposes", async () => {
    let complete!: (snapshot: CloudConversationSnapshotDto) => void;
    const response = new Promise<CloudConversationSnapshotDto>((resolve) => {
      complete = resolve;
    });
    const s = createConversationSession({
      conversationId: "conversation-a",
      transport: {
        history: async () => ({ items: [], runs: [], nextCursor: null }),
        snapshot: () => response,
        stream: async () => (async function* () {})(),
      },
    });
    s.reconnect();
    s.dispose();
    const disposed = s.getSnapshot();
    complete(snapshot());
    await response;
    await Promise.resolve();
    expect(s.getSnapshot()).toBe(disposed);
    expect(s.getSnapshot().data).toBeNull();
  });
});
function turn(id: string, at: Date = now): CloudConversationSnapshotDto["turns"][number] {
  return {
    id,
    scope: { type: "personal", ownerUserId: "account-a" },
    createdAt: at,
    updatedAt: at,
    conversationId: "conversation-a",
    actorId: "account-a",
    prompt: id,
    mode: "search",
    runId: `run-${id}`,
    attachmentIds: [],
    idempotencyKey: id,
  };
}
function run(id: string, sequence = 1): CloudConversationSnapshotDto["runs"][number] {
  return {
    id: `run-${id}`,
    scope: { type: "personal", ownerUserId: "account-a" },
    createdAt: now,
    updatedAt: now,
    conversationId: "conversation-a",
    turnId: id,
    taskId: null,
    roundId: null,
    ownerAccountId: "account-a",
    leaseExpiresAt: null,
    requestedByUserId: "account-a",
    mode: "search",
    prompt: id,
    attachmentIds: [],
    status: "running",
    attempt: 1,
    retryOfRunId: null,
    lastSequence: sequence,
    ownerId: null,
    epoch: 0,
    heartbeatAt: null,
    startedAt: null,
    completedAt: null,
    cancelRequested: false,
    output: null,
    error: null,
    dispatchReady: true,
  };
}
it("merges older pages without losing live updates when a run leaves the recent window", async () => {
  let deliver!: (value: CloudConversationSnapshotDto) => void;
  const next = new Promise<CloudConversationSnapshotDto>((resolve) => {
    deliver = resolve;
  });
  const initial = {
    ...snapshot(),
    turns: [turn("recent")],
    runs: [run("recent", 2)],
    historyCursor: "older-page",
  };
  const s = createConversationSession({
    conversationId: "conversation-a",
    initialSnapshot: initial,
    transport: {
      snapshot: async () => initial,
      history: async (cursor) => {
        expect(cursor).toBe("older-page");
        return {
          items: [turn("older", new Date("2026-10-05T00:00:00Z"))],
          runs: [run("older")],
          nextCursor: null,
        };
      },
      stream: async (signal) =>
        (async function* () {
          yield await next;
          await block(signal);
        })(),
    },
  });
  s.reconnect();
  await expect.poll(() => s.getSnapshot().connection).toBe("connected");
  await s.loadHistory();
  expect(s.getSnapshot().data?.turns.map((t) => t.id)).toEqual(["older", "recent"]);
  deliver({
    ...snapshot(),
    turns: [turn("new")],
    runs: [run("new", 3)],
    historyCursor: "older-page",
  });
  await expect.poll(() => s.getSnapshot().data?.runs.length).toBe(3);
  expect(s.getSnapshot().data?.historyCursor).toBeNull();
  expect(s.getSnapshot().data?.runs.find((r) => r.id === "run-recent")?.lastSequence).toBe(2);
  s.dispose();
});
it("cannot publish a history page after its account owner is disposed", async () => {
  let deliver!: (value: {
    items: CloudConversationSnapshotDto["turns"];
    runs: CloudConversationSnapshotDto["runs"];
    nextCursor: string | null;
  }) => void;
  const response = new Promise<{
    items: CloudConversationSnapshotDto["turns"];
    runs: CloudConversationSnapshotDto["runs"];
    nextCursor: string | null;
  }>((resolve) => {
    deliver = resolve;
  });
  const s = createConversationSession({
    conversationId: "conversation-a",
    initialSnapshot: { ...snapshot(), historyCursor: "older-page" },
    transport: {
      snapshot: async () => snapshot(),
      stream: async (signal) =>
        (async function* () {
          await block(signal);
        })(),
      history: () => response,
    },
  });
  const loading = s.loadHistory();
  s.dispose();
  const disposed = s.getSnapshot();
  deliver({ items: [turn("older")], runs: [run("older")], nextCursor: null });
  await loading;
  expect(s.getSnapshot()).toBe(disposed);
  expect(s.getSnapshot().data?.turns).toHaveLength(0);
});
it("keeps an in-flight history page when the same conversation reconnects", async () => {
  let deliver!: (value: {
    items: CloudConversationSnapshotDto["turns"];
    runs: CloudConversationSnapshotDto["runs"];
    nextCursor: string | null;
  }) => void;
  const response = new Promise<{
    items: CloudConversationSnapshotDto["turns"];
    runs: CloudConversationSnapshotDto["runs"];
    nextCursor: string | null;
  }>((resolve) => {
    deliver = resolve;
  });
  const historySignals: AbortSignal[] = [];
  const initial = {
    ...snapshot(),
    turns: [turn("recent")],
    runs: [run("recent")],
    historyCursor: "older-page",
  };
  const s = createConversationSession({
    conversationId: "conversation-a",
    initialSnapshot: initial,
    transport: {
      snapshot: async () => initial,
      stream: async (signal) =>
        (async function* () {
          await block(signal);
        })(),
      history: (_cursor, signal) => {
        historySignals.push(signal);
        return response;
      },
    },
  });
  s.reconnect();
  await expect.poll(() => s.getSnapshot().connection).toBe("connected");
  const loading = s.loadHistory();
  s.reconnect();
  expect(s.getSnapshot().historyLoading).toBe(true);
  deliver({
    items: [turn("older", new Date("2026-10-05T00:00:00Z"))],
    runs: [run("older")],
    nextCursor: null,
  });
  await loading;
  expect(historySignals[0]?.aborted).toBe(false);
  expect(s.getSnapshot().data?.turns.map((item) => item.id)).toEqual(["older", "recent"]);
  expect(s.getSnapshot().data?.historyCursor).toBeNull();
  expect(s.getSnapshot().historyLoading).toBe(false);
  s.dispose();
});
it("aborts history and rejects its late page when stream authorization is revoked", async () => {
  let deliverHistory!: (value: {
    items: CloudConversationSnapshotDto["turns"];
    runs: CloudConversationSnapshotDto["runs"];
    nextCursor: string | null;
  }) => void;
  const history = new Promise<{
    items: CloudConversationSnapshotDto["turns"];
    runs: CloudConversationSnapshotDto["runs"];
    nextCursor: string | null;
  }>((resolve) => {
    deliverHistory = resolve;
  });
  let revoke!: () => void;
  const revoked = new Promise<void>((resolve) => {
    revoke = resolve;
  });
  const historySignals: AbortSignal[] = [];
  const initial = { ...snapshot(), historyCursor: "older-page" };
  const s = createConversationSession({
    conversationId: "conversation-a",
    initialSnapshot: initial,
    transport: {
      snapshot: async () => initial,
      stream: async () =>
        (async function* () {
          await revoked;
          throw { code: "FORBIDDEN" };
        })(),
      history: (_cursor, signal) => {
        historySignals.push(signal);
        return history;
      },
    },
  });
  s.reconnect();
  await expect.poll(() => s.getSnapshot().connection).toBe("connected");
  const loading = s.loadHistory();
  revoke();
  await expect.poll(() => s.getSnapshot().connection).toBe("failed");
  expect(historySignals[0]?.aborted).toBe(true);
  expect(s.getSnapshot().historyLoading).toBe(false);
  const denied = s.getSnapshot();
  deliverHistory({ items: [turn("older")], runs: [run("older")], nextCursor: null });
  await loading;
  expect(s.getSnapshot()).toBe(denied);
  expect(s.getSnapshot().data).toBeNull();
  s.dispose();
});
