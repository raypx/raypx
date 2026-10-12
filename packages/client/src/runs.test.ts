import { describe, expect, it } from "vite-plus/test";
import type { AgentRunDto, RunEventDto, RunSnapshotDto } from "@voidmix/contracts";
import { createRunSession, type RunTransport } from "./runs.js";

const now = new Date("2026-10-04T00:00:00Z");
function snapshot(overrides: Partial<AgentRunDto> = {}): RunSnapshotDto {
  return {
    run: {
      id: "run-1",
      projectId: "project-1",
      taskId: "task-1",
      targetDeviceId: "device-1",
      requestedByUserId: "user-1",
      assetVersionId: null,
      status: "running",
      attempt: 1,
      retryOfRunId: null,
      prompt: "Inspect files",
      input: {},
      output: null,
      error: null,
      lastSeq: 0,
      claimId: "claim-1",
      acceptedAt: now,
      completedAt: null,
      pendingApprovalId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    },
    events: [],
    commands: [],
    artifacts: [],
    earliestSeq: 0,
    historyTruncated: false,
  };
}
const text = (seq: number): RunEventDto => ({
  runId: "run-1",
  seq,
  occurredAt: now,
  type: "message.delta",
  payload: { messageId: "message-1", text: `part-${seq}` },
});
function untilAbort(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

describe("run session lifecycle", () => {
  it("constructs without requests and preserves snapshot identity between changes", () => {
    let reads = 0;
    const transport: RunTransport = {
      snapshot: async () => {
        reads++;
        return snapshot();
      },
      stream: async () => (async function* () {})(),
    };
    const session = createRunSession({ runId: "run-1", transport });
    expect(session.getSnapshot()).toBe(session.getSnapshot());
    expect(reads).toBe(0);
    session.dispose();
    expect(reads).toBe(0);
  });
  it("supports a mount cleanup and replay without losing the subscription", async () => {
    let reads = 0;
    const transport: RunTransport = {
      snapshot: async () => {
        reads++;
        return snapshot({ status: "succeeded" });
      },
      stream: async () => (async function* () {})(),
    };
    const session = createRunSession({ runId: "run-1", transport });
    const stop = session.subscribe(() => {});
    session.reconnect();
    session.dispose();
    session.reconnect();
    await expect.poll(() => session.getSnapshot().connection).toBe("connected");
    expect(reads).toBe(2);
    stop();
    session.dispose();
  });
  it("resumes from the snapshot boundary, ignores duplicates and keeps native dates", async () => {
    const cursors: number[] = [];
    const transport: RunTransport = {
      snapshot: async () => snapshot({ lastSeq: 1 }),
      stream: async (_runId, afterSeq, signal) => {
        cursors.push(afterSeq);
        return (async function* () {
          yield text(2);
          yield text(2);
          await untilAbort(signal);
        })();
      },
    };
    const session = createRunSession({ runId: "run-1", transport });
    session.reconnect();
    await expect.poll(() => session.getSnapshot().events.length).toBe(1);
    expect(cursors).toEqual([1]);
    expect(session.getSnapshot().events[0]?.occurredAt).toBeInstanceOf(Date);
    expect(session.getSnapshot().run?.lastSeq).toBe(2);
    session.dispose();
  });
  it("recovers a sequence gap from durable history without acknowledging the missing event", async () => {
    let reads = 0;
    const cursors: number[] = [];
    const transport: RunTransport = {
      snapshot: async () => snapshot({ lastSeq: reads++ ? 2 : 0 }),
      stream: async (_runId, afterSeq, signal) => {
        cursors.push(afterSeq);
        return (async function* () {
          yield text(3);
          await untilAbort(signal);
        })();
      },
    };
    const session = createRunSession({ runId: "run-1", transport, retryDelayMs: 1 });
    session.reconnect();
    await expect.poll(() => session.getSnapshot().run?.lastSeq).toBe(3);
    expect(cursors).toEqual([0, 2]);
    expect(session.getSnapshot().events.map((event) => event.seq)).toEqual([3]);
    session.dispose();
  });
  it("ignores late responses after disposal and never cancels the durable run", async () => {
    let resolve!: (value: RunSnapshotDto) => void;
    const request = new Promise<RunSnapshotDto>((done) => {
      resolve = done;
    });
    const transport: RunTransport = {
      snapshot: () => request,
      stream: async () => (async function* () {})(),
    };
    const session = createRunSession({ runId: "run-1", transport });
    let changes = 0;
    session.subscribe(() => changes++);
    session.reconnect();
    session.dispose();
    const before = changes;
    resolve(snapshot());
    await request;
    await Promise.resolve();
    expect(changes).toBe(before);
    expect(session.getSnapshot().run).toBeNull();
  });
  it("stops retrying after authorization is rejected", async () => {
    let reads = 0;
    const transport: RunTransport = {
      snapshot: async () => {
        reads++;
        throw { code: "FORBIDDEN" };
      },
      stream: async () => (async function* () {})(),
    };
    const session = createRunSession({ runId: "run-1", transport, retryDelayMs: 1 });
    session.reconnect();
    await expect.poll(() => session.getSnapshot().connection).toBe("failed");
    expect(reads).toBe(1);
    expect(session.getSnapshot().error).toEqual({ code: "FORBIDDEN" });
    session.dispose();
  });
  it("does not treat an ended transport as successful execution", async () => {
    const transport: RunTransport = {
      snapshot: async () => snapshot(),
      stream: async () => (async function* () {})(),
    };
    const session = createRunSession({ runId: "run-1", transport, retryDelayMs: 50 });
    session.reconnect();
    await expect.poll(() => session.getSnapshot().connection).toBe("reconnecting");
    expect(session.getSnapshot().run?.status).toBe("running");
    session.dispose();
  });
});
