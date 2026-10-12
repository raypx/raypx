import { describe, expect, it } from "vite-plus/test";
import type { CloudRunEventDto, CloudRunSnapshotDto } from "@voidmix/contracts";
import { createCloudRunSession } from "./cloud-runs.js";
const now = new Date("2026-10-08T00:00:00Z");
function fixture(cursor = 200): CloudRunSnapshotDto {
  return {
    run: {
      id: "run",
      scope: { type: "personal", ownerUserId: "account" },
      createdAt: now,
      updatedAt: now,
      conversationId: "conversation",
      turnId: "turn",
      taskId: null,
      roundId: null,
      ownerAccountId: "account",
      requestedByUserId: "account",
      mode: "search",
      prompt: "question",
      attachmentIds: [],
      status: "running",
      attempt: 1,
      retryOfRunId: null,
      lastSequence: cursor,
      ownerId: null,
      epoch: 1,
      heartbeatAt: null,
      leaseExpiresAt: null,
      startedAt: now,
      completedAt: null,
      cancelRequested: false,
      output: null,
      error: null,
      dispatchReady: true,
    },
    events: [event(cursor)],
    messages: [
      {
        id: "message",
        runId: "run",
        messageId: "message",
        executionId: null,
        scope: { type: "personal", ownerUserId: "account" },
        createdAt: now,
        updatedAt: now,
        sequence: cursor,
        text: "all preceding tokens",
        completed: false,
      },
    ],
    executions: [],
    commands: [],
    sources: [],
    artifacts: [],
    cursor,
    historyTruncated: true,
    historyCursor: cursor,
  };
}
function event(sequence: number): CloudRunEventDto {
  return {
    runId: "run",
    sequence,
    eventId: `event-${sequence}`,
    executionId: null,
    occurredAt: now,
    type: "message.delta",
    payload: { messageId: "message", text: " next" },
  };
}
function block(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
describe("bounded cloud Run snapshots", () => {
  it("keeps the live window bounded and backfills gaps before continuing older history", async () => {
    let advance!: () => void;
    const next = new Promise<void>((resolve) => {
      advance = resolve;
    });
    const reads: number[] = [];
    const session = createCloudRunSession({
      runId: "run",
      transport: {
        snapshot: async () => fixture(),
        stream: async (_cursor, signal) =>
          (async function* () {
            for (let sequence = 201; sequence <= 450; sequence++) yield event(sequence);
            await next;
            for (let sequence = 451; sequence <= 650; sequence++) yield event(sequence);
            await block(signal);
          })(),
        history: async (before) => {
          reads.push(before);
          return {
            items: Array.from({ length: Math.min(200, before - 1) }, (_, index) =>
              event(Math.max(1, before - 200) + index),
            ),
            hasMore: before > 201,
          };
        },
      },
    });
    session.reconnect();
    await expect.poll(() => session.getSnapshot().data?.cursor).toBe(450);
    expect(session.getSnapshot().data?.events).toHaveLength(200);
    expect(session.getSnapshot().data?.historyCursor).toBe(251);
    await session.loadHistory();
    expect(reads).toEqual([251]);
    advance();
    await expect.poll(() => session.getSnapshot().data?.cursor).toBe(650);
    expect(session.getSnapshot().data?.historyCursor).toBe(451);
    await session.loadHistory();
    expect(reads).toEqual([251, 451]);
    expect(session.getSnapshot().data?.historyCursor).toBe(51);
    session.dispose();
  });
  it("shows the message projection immediately and pages old events only on request", async () => {
    const cursors: number[] = [];
    const history: number[] = [];
    const session = createCloudRunSession({
      runId: "run",
      transport: {
        snapshot: async () => fixture(),
        stream: async (cursor, signal) => {
          cursors.push(cursor);
          return (async function* () {
            yield event(201);
            await block(signal);
          })();
        },
        history: async (before) => {
          history.push(before);
          return { items: [event(198), event(199)], hasMore: true };
        },
      },
    });
    session.reconnect();
    await expect.poll(() => session.getSnapshot().data?.cursor).toBe(201);
    expect(cursors).toEqual([200]);
    expect(history).toEqual([]);
    expect(session.getSnapshot().data?.messages[0]?.text).toBe("all preceding tokens next");
    expect(session.getSnapshot().data?.events.map((item) => item.sequence)).toEqual([200, 201]);
    await session.loadHistory();
    expect(history).toEqual([200]);
    expect(session.getSnapshot().data?.events.map((item) => item.sequence)).toEqual([
      198, 199, 200, 201,
    ]);
    expect(session.getSnapshot().data?.historyCursor).toBe(198);
    session.dispose();
  });
  it("rejects a late history page after its account owner exits", async () => {
    let complete!: (page: { items: CloudRunEventDto[]; hasMore: boolean }) => void;
    const pending = new Promise<{ items: CloudRunEventDto[]; hasMore: boolean }>((resolve) => {
      complete = resolve;
    });
    const session = createCloudRunSession({
      runId: "run",
      transport: {
        snapshot: async () => fixture(),
        stream: async (_cursor, signal) =>
          (async function* () {
            await block(signal);
          })(),
        history: () => pending,
      },
    });
    session.reconnect();
    await expect.poll(() => session.getSnapshot().data?.cursor).toBe(200);
    const loading = session.loadHistory();
    session.dispose();
    const previous = session.getSnapshot();
    complete({ items: [event(199)], hasMore: false });
    await loading;
    expect(session.getSnapshot()).toBe(previous);
  });
});
