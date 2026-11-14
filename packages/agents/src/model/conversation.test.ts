import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { agentIdSchema, conversationIdSchema, type Conversation } from "@raypx/core/agents";
import {
  messageIdSchema,
  runIdSchema,
  type Message,
  type ReplySegment,
  type Run,
} from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { ConversationController } from "./controller.js";
import {
  ConversationState,
  conversationRows,
  activeConversationRun,
  conversationSenderVisible,
} from "./conversation.js";
import { conversationDraftKey, readConversationDraft } from "./drafts.js";
import {
  applyAgents,
  applySpaces,
  createAgentsPageState,
  parseAgentSelection,
  selectAgent,
  selectSpace,
} from "./page.js";
import type {
  AgentConversationView,
  ConversationPort,
  ConversationSnapshot,
  ConversationSocketPort,
  SpaceMembership,
} from "./port.js";

const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
const owner = { origin: "https://one.example", accountId: "member" };
const time = "2026-11-13T00:00:00.000Z";
const conversation: Conversation = {
  id: selection.conversationId,
  spaceId: selection.spaceId,
  agentId: agentIdSchema.parse("agent"),
  kind: "direct",
  createdAt: time,
};
function message(id = "message", sequence = 1): Message {
  return {
    id: messageIdSchema.parse(id),
    ...selection,
    author: { kind: "member", accountId: owner.accountId },
    text: "Hello 世界",
    sequence,
    createdAt: time,
  };
}
function run(state: Run["state"] = "queued"): Run {
  return {
    id: runIdSchema.parse("run"),
    ...selection,
    agentId: conversation.agentId,
    trigger: "message",
    messageId: message().id,
    memberAccountId: owner.accountId,
    model: { modelId: "fixture" },
    state,
    failureCode: state === "failed" ? "MODEL_FAILED" : null,
    createdAt: time,
    startedAt: null,
    firstResponseAt: null,
    finishedAt: null,
  };
}
function snapshot(input: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return { conversation, messages: [], segments: [], runs: [], cursor: 0, ...input };
}
function messageEvent(
  sequence = 1,
  id = "message",
): Extract<ConversationServerFrame, { type: "event" }> {
  const value = message(id, sequence);
  return {
    type: "event",
    entry: {
      event: {
        kind: "message.created",
        ...selection,
        sequence,
        messageId: value.id,
        createdAt: time,
      },
      message: value,
    },
  };
}
function runEvent(
  state: Run["state"],
  sequence: number,
): Extract<ConversationServerFrame, { type: "event" }> {
  return {
    type: "event",
    entry: {
      event: {
        kind: "run.state",
        ...selection,
        sequence,
        runId: run().id,
        state,
        failureCode: state === "failed" ? "MODEL_FAILED" : null,
        createdAt: time,
      },
    },
  };
}
function prefix(text: string): Extract<ConversationServerFrame, { type: "reply.prefix" }> {
  return {
    type: "reply.prefix",
    ...selection,
    runId: run().id,
    segmentId: "segment",
    offset: 0,
    text,
  };
}
function segment(
  text: string,
  sequence: number,
): Extract<ConversationServerFrame, { type: "event" }> {
  const value: ReplySegment = {
    id: "segment",
    ...selection,
    runId: run().id,
    sequence,
    text,
    createdAt: time,
  };
  return {
    type: "event",
    entry: {
      event: { kind: "reply.segment", ...selection, sequence, segment: value, createdAt: time },
    },
  };
}
function harness(initial = snapshot()) {
  const stored = new Map<string, string>();
  const frames: ConversationClientFrame[] = [];
  const connections: Array<Parameters<ConversationSocketPort["connect"]>[0]> = [];
  const close = vi.fn();
  const port: ConversationPort = {
    snapshot: vi.fn(async () => initial),
    send: vi.fn(async () => message()),
    stop: vi.fn(async () => run("cancelled")),
  };
  const drafts = {
    read: (key: string) => stored.get(key) ?? null,
    write: (key: string, value: string) => {
      stored.set(key, value);
    },
    remove: (key: string) => {
      stored.delete(key);
    },
  };
  const socket: ConversationSocketPort = {
    connect(callbacks) {
      connections.push(callbacks);
      return {
        send: (frame) => {
          frames.push(frame);
        },
        close,
      };
    },
  };
  const key = vi.fn(() => "receipt-1");
  const controller = new ConversationController({ selection, owner, port, drafts, socket, key });
  return { controller, stored, drafts, socket, port, frames, connections, close, key };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("ConversationState", () => {
  it("applies a snapshot and ordered events exactly once, without advancing on a gap", () => {
    const state = new ConversationState(selection);
    expect(state.applySnapshot(snapshot({ messages: [message()], cursor: 1 }))).toBe(true);
    const baseline = state.getSnapshot();
    expect(state.applyEvent(messageEvent().entry)).toBe("duplicate");
    expect(state.getSnapshot()).toBe(baseline);
    expect(state.applyEvent(messageEvent(3, "later").entry)).toBe("snapshot-required");
    expect(state.getSnapshot()).toBe(baseline);
    expect(state.applyEvent(runEvent("queued", 2).entry)).toBe("applied");
    expect(state.getSnapshot().cursor).toBe(2);
    expect(state.getSnapshot().runs[0]).toMatchObject({ messageId: "message", state: "queued" });
    expect(state.applyEvent(messageEvent(3, "later").entry)).toBe("applied");
    expect(state.getSnapshot().messages.map((item) => item.id)).toEqual(["message", "later"]);
  });
  it("rejects mismatched hydrated messages, foreign snapshots and stale snapshots atomically", () => {
    const state = new ConversationState(selection);
    const foreign = messageEvent();
    foreign.entry.message = { ...message(), conversationId: conversationIdSchema.parse("other") };
    expect(state.applyEvent(foreign.entry)).toBe("snapshot-required");
    expect(state.getSnapshot().cursor).toBe(0);
    expect(
      state.applySnapshot(
        snapshot({ conversation: { ...conversation, id: conversationIdSchema.parse("other") } }),
      ),
    ).toBe(false);
    expect(state.applySnapshot(snapshot({ cursor: 3, messages: [message()] }))).toBe(true);
    const previous = state.getSnapshot();
    expect(state.applySnapshot(snapshot())).toBe(false);
    expect(state.getSnapshot()).toBe(previous);
  });
  it("converges prefix and UTF-16 deltas to the committed segment and ignores late deltas", () => {
    const state = new ConversationState(selection);
    state.applySnapshot(snapshot({ messages: [message()], runs: [run("running")], cursor: 3 }));
    expect(state.applyReply(prefix("Hi 😀"))).toBe("applied");
    expect(state.applyReply({ ...prefix(" 世界"), type: "reply.delta", offset: 5 })).toBe(
      "applied",
    );
    expect(state.getSnapshot().liveReplies[0]?.text).toBe("Hi 😀 世界");
    expect(state.getSnapshot().cursor).toBe(3);
    expect(state.applyEvent(segment("Committed answer", 4).entry)).toBe("applied");
    expect(state.getSnapshot().segments[0]?.text).toBe("Committed answer");
    expect(state.getSnapshot().liveReplies).toEqual([]);
    expect(state.applyReply(prefix("stale"))).toBe("ignored");
    expect(state.getSnapshot().segments).toHaveLength(1);
  });
  it("requires a new prefix after non-adjacent deltas and preserves durable state", () => {
    const state = new ConversationState(selection);
    state.applySnapshot(snapshot({ cursor: 2, messages: [message()], runs: [run()] }));
    state.applyReply(prefix("abc"));
    expect(state.applyReply({ ...prefix("x"), type: "reply.delta", offset: 4 })).toBe("reconnect");
    expect(state.getSnapshot().liveReplies[0]?.text).toBe("abc");
    expect(state.getSnapshot().cursor).toBe(2);
    state.clearLiveReplies();
    expect(state.applyReply(prefix("abcxy"))).toBe("applied");
    expect(state.getSnapshot().liveReplies[0]?.text).toBe("abcxy");
  });
  it.each(["failed", "cancelled"] as const)(
    "retains explicit %s state and clears unfinished output",
    (status) => {
      const state = new ConversationState(selection);
      state.applySnapshot(snapshot({ cursor: 2, messages: [message()], runs: [run()] }));
      state.applyReply(prefix("unfinished"));
      state.applyEvent(runEvent(status, 3).entry);
      expect(state.getSnapshot().liveReplies).toEqual([]);
      expect(state.getSnapshot().runs[0]?.state).toBe(status);
      expect(state.getSnapshot().runs[0]?.failureCode).toBe(
        status === "failed" ? "MODEL_FAILED" : null,
      );
      expect(state.applyReply(prefix("late"))).toBe("ignored");
    },
  );
});

describe("ConversationController", () => {
  it("keeps a confirmed send receipt ahead of an in-flight snapshot until replay catches up", async () => {
    const h = harness();
    let resolve: (value: ConversationSnapshot) => void = () => {};
    vi.mocked(h.port.snapshot).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const starting = h.controller.start();
    h.controller.setDraft(message().text);
    expect(await h.controller.send()).toBe(true);
    expect(h.controller.getSnapshot()).toMatchObject({ cursor: 0, draft: "" });
    resolve(snapshot());
    await starting;
    expect(h.controller.getSnapshot().messages).toEqual([message()]);
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    h.connections[0]!.onFrame(messageEvent());
    expect(h.controller.getSnapshot().messages).toEqual([message()]);
    expect(h.controller.getSnapshot().cursor).toBe(1);
    h.controller.dispose();
  });
  it("replaces a socket that never becomes ready and fences its late callbacks", async () => {
    vi.useFakeTimers();
    const h = harness(snapshot({ cursor: 1, messages: [message()] }));
    await h.controller.start();
    expect(h.controller.getSnapshot().connection).toBe("connecting");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().connection).toBe("reconnecting");
    h.connections[0]!.onFrame(messageEvent(2, "late"));
    expect(h.controller.getSnapshot().cursor).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.connections).toHaveLength(2);
    h.connections[1]!.onFrame({ type: "ready", version: 1 });
    expect(h.frames.at(-1)).toMatchObject({ type: "subscribe", after: 1 });
    expect(h.controller.getSnapshot().connection).toBe("live");
    h.controller.dispose();
  });
  it("restores a failed Run retry from a snapshot without creating a receipt or sending", async () => {
    const h = harness(snapshot({ cursor: 5, messages: [message()], runs: [run("failed")] }));
    await h.controller.start();
    expect(h.controller.prepareRetry(run().id)).toBe(true);
    expect(h.controller.getSnapshot().draft).toBe(message().text);
    expect(h.controller.getSnapshot().pending).toBeNull();
    expect(h.port.send).not.toHaveBeenCalled();
    expect(h.key).not.toHaveBeenCalled();
    h.controller.dispose();
  });
  it("acknowledges a replayed event while preserving the applied projection", async () => {
    const h = harness(snapshot({ cursor: 1, messages: [message()] }));
    await h.controller.start();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    h.connections[0]!.onFrame(messageEvent());
    expect(h.frames.at(-1)).toEqual({ type: "ack", version: 1, ...selection, sequence: 1 });
    expect(h.controller.getSnapshot().messages).toEqual([message()]);
    expect(h.controller.getSnapshot().cursor).toBe(1);
    h.controller.dispose();
  });
  it("does not apply a send result after disposal and retains its safe retry receipt", async () => {
    const h = harness();
    let resolve: (value: Message) => void = () => {};
    vi.mocked(h.port.send).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    h.controller.setDraft(message().text);
    const sending = h.controller.send();
    h.controller.dispose();
    const previous = h.controller.getSnapshot();
    resolve(message());
    expect(await sending).toBe(false);
    expect(h.controller.getSnapshot()).toBe(previous);
    expect(
      readConversationDraft(h.stored.get(conversationDraftKey(owner, selection)) ?? null).pending,
    ).toEqual({ idempotencyKey: "receipt-1", text: message().text });
  });
  it("keeps a storage-read warning through connection and safely retains a receipt after cleanup fails", async () => {
    const h = harness();
    const readFailure = new ConversationController({
      selection,
      owner,
      port: h.port,
      socket: h.socket,
      drafts: {
        ...h.drafts,
        read() {
          throw new Error("blocked");
        },
      },
      key: h.key,
    });
    await readFailure.start();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    expect(readFailure.getSnapshot().error).toBe("storage");
    readFailure.dispose();
    const cleanupFailure = new ConversationController({
      selection,
      owner,
      port: h.port,
      socket: h.socket,
      drafts: {
        ...h.drafts,
        remove() {
          throw new Error("blocked");
        },
      },
      key: h.key,
    });
    cleanupFailure.setDraft(message().text);
    expect(await cleanupFailure.send()).toBe(true);
    expect(cleanupFailure.getSnapshot()).toMatchObject({
      draft: "",
      pending: null,
      error: "storage",
    });
    expect(
      readConversationDraft(h.stored.get(conversationDraftKey(owner, selection)) ?? null).pending
        ?.idempotencyKey,
    ).toBe("receipt-1");
    cleanupFailure.dispose();
    h.controller.dispose();
  });
  it("subscribes from its snapshot cursor, applies before acknowledgement, then resumes after a lost ACK", async () => {
    vi.useFakeTimers();
    const h = harness(snapshot({ cursor: 2, messages: [message()], runs: [run()] }));
    await h.controller.start();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    expect(h.frames[0]).toEqual({ type: "subscribe", version: 1, ...selection, after: 2 });
    const observed: number[] = [];
    h.controller.subscribe(() => {
      observed.push(h.controller.getSnapshot().cursor);
    });
    h.connections[0]!.onFrame(runEvent("running", 3));
    expect(observed).toContain(3);
    expect(h.frames.at(-1)).toEqual({ type: "ack", version: 1, ...selection, sequence: 3 });
    h.connections[0]!.onClose(1006);
    expect(h.controller.getSnapshot().connection).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1_000);
    h.connections[1]!.onFrame({ type: "ready", version: 1 });
    expect(h.frames.at(-1)).toEqual({ type: "subscribe", version: 1, ...selection, after: 3 });
    h.connections[1]!.onFrame(runEvent("running", 3));
    expect(h.controller.getSnapshot().runs).toHaveLength(1);
    h.controller.dispose();
  });
  it("loads a new authoritative snapshot on retention or cursor gaps without losing a draft", async () => {
    const h = harness(snapshot({ cursor: 2, messages: [message()], runs: [run()] }));
    await h.controller.start();
    h.controller.setDraft("unsent draft");
    vi.mocked(h.port.snapshot).mockResolvedValueOnce(
      snapshot({ cursor: 6, messages: [message(), message("next", 4)], runs: [run("succeeded")] }),
    );
    h.connections[0]!.onFrame({ type: "snapshot-required", ...selection, cursor: 6 });
    expect(h.controller.getSnapshot().connection).toBe("snapshot-required");
    await Promise.resolve();
    expect(h.controller.getSnapshot().cursor).toBe(6);
    expect(h.controller.getSnapshot().draft).toBe("unsent draft");
    h.connections[1]!.onFrame({ type: "ready", version: 1 });
    expect(h.frames.at(-1)).toMatchObject({ type: "subscribe", after: 6 });
    expect(h.controller.getSnapshot().messages).toHaveLength(2);
    expect(h.port.send).not.toHaveBeenCalled();
    h.controller.dispose();
  });
  it("ignores late snapshots and socket callbacks after disposal", async () => {
    const h = harness();
    let resolve: (value: ConversationSnapshot) => void = () => {};
    vi.mocked(h.port.snapshot).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = h.controller.start();
    h.controller.dispose();
    resolve(snapshot({ cursor: 1, messages: [message()] }));
    await pending;
    expect(h.connections).toHaveLength(0);
    expect(h.controller.getSnapshot().cursor).toBe(0);
  });
  it("persists a frozen idempotency receipt, restores without sending, and retries deliberately", async () => {
    const h = harness();
    h.controller.setDraft("Hello 世界");
    vi.mocked(h.port.send).mockRejectedValueOnce(new Error("uncertain"));
    expect(await h.controller.send()).toBe(false);
    expect(h.controller.getSnapshot().pending).toEqual({
      text: "Hello 世界",
      idempotencyKey: "receipt-1",
    });
    h.controller.dispose();
    const restored = new ConversationController({
      selection,
      owner,
      port: h.port,
      drafts: h.drafts,
      socket: h.socket,
      key: h.key,
    });
    await restored.start();
    expect(h.port.send).toHaveBeenCalledTimes(1);
    expect(restored.getSnapshot().draft).toBe("Hello 世界");
    restored.setDraft("replacement draft");
    expect(await restored.send()).toBe(false);
    expect(await restored.sendPending()).toBe(true);
    expect(vi.mocked(h.port.send).mock.calls[1]?.[0].message).toEqual({
      text: "Hello 世界",
      idempotencyKey: "receipt-1",
    });
    expect(restored.getSnapshot().draft).toBe("replacement draft");
    expect(restored.getSnapshot().pending).toBeNull();
    expect(h.key).toHaveBeenCalledTimes(1);
    restored.dispose();
  });
  it("keeps queued messages while another Run streams and retry only prepares a failed message", async () => {
    const h = harness(snapshot({ cursor: 3, messages: [message()], runs: [run("running")] }));
    await h.controller.start();
    h.connections[0]!.onFrame(prefix("in progress"));
    h.connections[0]!.onFrame(messageEvent(4, "next"));
    h.connections[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...runEvent("queued", 5).entry.event,
          kind: "run.state",
          runId: runIdSchema.parse("next-run"),
          state: "queued",
          failureCode: null,
        },
      },
    });
    expect(h.controller.getSnapshot().runs.find((item) => item.id === "next-run")).toMatchObject({
      state: "queued",
      messageId: "next",
    });
    expect(h.controller.getSnapshot().liveReplies[0]?.text).toBe("in progress");
    h.connections[0]!.onFrame(runEvent("failed", 6));
    expect(h.controller.prepareRetry(run().id)).toBe(true);
    expect(h.controller.getSnapshot().draft).toBe(message().text);
    expect(h.controller.getSnapshot().runs.find((item) => item.id === run().id)?.state).toBe(
      "failed",
    );
    expect(h.port.send).not.toHaveBeenCalled();
    h.controller.dispose();
  });
  it("blocks dispatch when the idempotency receipt cannot be persisted", async () => {
    const h = harness();
    const controller = new ConversationController({
      selection,
      owner,
      port: h.port,
      socket: h.socket,
      drafts: {
        ...h.drafts,
        write() {
          throw new Error("full");
        },
      },
      key: h.key,
    });
    controller.setDraft("keep me");
    expect(await controller.send()).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({ draft: "keep me", error: "storage" });
    expect(h.port.send).not.toHaveBeenCalled();
    controller.dispose();
    h.controller.dispose();
  });
  it("retains history after authorization loss and does not reconnect automatically", async () => {
    vi.useFakeTimers();
    const h = harness(snapshot({ cursor: 1, messages: [message()] }));
    await h.controller.start();
    h.connections[0]!.onClose(4003);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.connections).toHaveLength(1);
    expect(h.controller.getSnapshot()).toMatchObject({
      cursor: 1,
      error: "load",
      connection: "reconnecting",
    });
    h.controller.dispose();
  });
});

describe("draft and page isolation", () => {
  it("isolates device drafts by server, account, Space and conversation", () => {
    const keys = [
      conversationDraftKey(owner, selection),
      conversationDraftKey({ ...owner, origin: "https://two.example" }, selection),
      conversationDraftKey({ ...owner, accountId: "other" }, selection),
      conversationDraftKey(owner, { ...selection, spaceId: spaceIdSchema.parse("other") }),
      conversationDraftKey(owner, {
        ...selection,
        conversationId: conversationIdSchema.parse("other"),
      }),
    ];
    expect(new Set(keys).size).toBe(5);
    const h = harness();
    h.controller.setDraft("private draft");
    const other = new ConversationController({
      selection,
      owner: { ...owner, accountId: "other" },
      port: h.port,
      socket: h.socket,
      drafts: h.drafts,
      key: h.key,
    });
    expect(other.getSnapshot().draft).toBe("");
    other.dispose();
    h.controller.dispose();
  });
  it("rejects unsupported or malformed stored drafts and validates route selectors", () => {
    for (const raw of [
      "{",
      '{"version":2,"text":"old"}',
      '{"version":1,"text":[],"pending":null}',
      '{"version":1,"text":"x","pending":{"text":"x","idempotencyKey":{}}}',
    ])
      expect(readConversationDraft(raw)).toEqual({ text: "", pending: null });
    expect(parseAgentSelection({ spaceId: "space", agentId: "agent", extra: "ignored" })).toEqual({
      spaceId: "space",
      agentId: "agent",
    });
    expect(parseAgentSelection({ spaceId: ["space"], agentId: "" })).toEqual({});
  });
  it("never carries an Agent selection or stale reads across a Space switch", () => {
    function membership(id: string): SpaceMembership {
      return {
        space: { id: spaceIdSchema.parse(id), name: id, createdAt: time, updatedAt: time },
        member: {
          spaceId: spaceIdSchema.parse(id),
          accountId: owner.accountId,
          role: "owner",
          createdAt: time,
        },
      };
    }
    const item: AgentConversationView = {
      conversation,
      agent: {
        id: conversation.agentId,
        spaceId: selection.spaceId,
        name: "Agent",
        instructions: "",
        model: { modelId: "fixture" },
        createdAt: time,
        updatedAt: time,
      },
    };
    let state = applySpaces(
      createAgentsPageState(),
      [membership("space"), membership("other")],
      "space",
    );
    state = applyAgents(state, "space", [item]);
    state = selectAgent(state, "agent");
    expect(state.agentId).toBe("agent");
    state = selectSpace(state, "other");
    expect(state).toMatchObject({ spaceId: "other", agentId: null, agents: [], models: [] });
    expect(applyAgents(state, "space", [item], "agent")).toBe(state);
    expect(selectAgent(state, "agent")).toBe(state);
  });
});

describe("chat presentation", () => {
  it("keeps the same reply identity and position through queue, streaming and committed output", () => {
    const state = new ConversationState(selection);
    state.applySnapshot(snapshot({ messages: [message()], runs: [run()], cursor: 2 }));
    const queued = conversationRows(state.getSnapshot());
    expect(queued.map((row) => row.id)).toEqual(["message", "reply:run"]);
    expect(queued[1]).toMatchObject({
      kind: "reply",
      text: "",
      sequence: 1.5,
      run: { state: "queued" },
    });
    state.applyEvent(runEvent("running", 3).entry);
    state.applyReply(prefix("A streamed reply"));
    // A later member message must not move the streaming reply when it commits.
    state.applyEvent(messageEvent(4, "later").entry);
    const streaming = conversationRows(state.getSnapshot());
    expect(streaming.map((row) => row.id)).toEqual(["message", "reply:run", "later"]);
    expect(streaming[1]?.text).toBe("A streamed reply");
    state.applyEvent(segment("The committed reply", 5).entry);
    state.applyEvent(runEvent("succeeded", 6).entry);
    const committed = conversationRows(state.getSnapshot());
    expect(committed.map((row) => row.id)).toEqual(streaming.map((row) => row.id));
    expect(committed[1]).toMatchObject({
      text: "The committed reply",
      sequence: 1.5,
      run: { state: "succeeded" },
    });
    expect(activeConversationRun(state.getSnapshot().runs)).toBeUndefined();
  });
  it.each(["cancelled", "failed"] as const)(
    "keeps a %s reply row and failure reason outside member content",
    (status) => {
      const state = new ConversationState(selection);
      state.applySnapshot(snapshot({ messages: [message()], runs: [run(status)], cursor: 3 }));
      const rows = conversationRows(state.getSnapshot());
      expect(rows[0]).toEqual({
        id: "message",
        kind: "member",
        sender: "member:member",
        sequence: 1,
        text: "Hello 世界",
      });
      expect(rows[1]).toMatchObject({
        kind: "reply",
        run: { state: status, failureCode: run(status).failureCode },
      });
    },
  );
  it("chooses the running Run before queued Runs and excludes finished Runs", () => {
    const state = new ConversationState(selection);
    state.applySnapshot(
      snapshot({
        messages: [message()],
        cursor: 1,
        runs: [
          run("failed"),
          { ...run(), id: runIdSchema.parse("queued") },
          { ...run("running"), id: runIdSchema.parse("active") },
        ],
      }),
    );
    expect(activeConversationRun(state.getSnapshot().runs)?.id).toBe("active");
    expect(activeConversationRun(state.getSnapshot().runs.slice(0, 2))?.id).toBe("queued");
  });
  it("does not clear a failed load when editing a local draft", async () => {
    const test = harness();
    vi.mocked(test.port.snapshot).mockRejectedValueOnce(new Error("unavailable"));
    await test.controller.start();
    expect(test.controller.getSnapshot().error).toBe("load");
    test.controller.setDraft("保留草稿");
    expect(test.controller.getSnapshot()).toMatchObject({ error: "load", draft: "保留草稿" });
    test.controller.reconnect();
    await vi.waitFor(() => expect(test.controller.getSnapshot().error).toBeNull());
    expect(test.controller.getSnapshot().draft).toBe("保留草稿");
    test.controller.dispose();
  });
});

it.each([false, true])(
  "uses sender context without adding group UI (consecutive: %s)",
  (consecutive) => {
    for (const showAgentNames of [false, true]) {
      for (const hasOtherMembers of [false, true]) {
        const context = { showAgentNames, hasOtherMembers };
        expect(conversationSenderVisible("reply", context, consecutive)).toBe(
          showAgentNames && !consecutive,
        );
        expect(conversationSenderVisible("member", context, consecutive)).toBe(
          hasOtherMembers && !consecutive,
        );
      }
    }
  },
);

it("retains additive inbound origin metadata through state events and scopes detail reads", () => {
  const state = new ConversationState(selection);
  const inbound: Run = {
    ...run("running"),
    trigger: "webhook",
    inboundProvenance: { kind: "repository", routineId: "routine", deliveryId: "delivery" },
  };
  expect(state.applySnapshot(snapshot({ runs: [inbound], cursor: 2 }))).toBe(true);
  expect(state.applyEvent(runEvent("waiting", 3).entry)).toBe("applied");
  expect(state.getSnapshot().runs[0]).toMatchObject({
    trigger: "webhook",
    inboundProvenance: inbound.inboundProvenance,
  });
  expect(
    state.applyRunDetails([
      { ...inbound, spaceId: spaceIdSchema.parse("elsewhere"), trigger: "email" },
    ]),
  ).toBe(false);
  expect(state.getSnapshot().cursor).toBe(3);
});

it("hydrates live Run origins without rolling back state, cursor or streaming text", async () => {
  const test = harness();
  await test.controller.start();
  const connection = test.connections[0]!;
  connection.onFrame({ type: "ready", version: 1 });
  connection.onFrame(messageEvent());
  vi.mocked(test.port.snapshot).mockResolvedValue(
    snapshot({
      messages: [message()],
      runs: [
        {
          ...run("queued"),
          trigger: "email",
          inboundProvenance: { kind: "email", routineId: "routine", deliveryId: "mail" },
        },
      ],
      cursor: 2,
    }),
  );
  connection.onFrame(runEvent("running", 2));
  connection.onFrame(prefix("Streaming"));
  await vi.waitFor(() => expect(test.controller.getSnapshot().runs[0]?.trigger).toBe("email"));
  expect(test.controller.getSnapshot().runs[0]?.state).toBe("running");
  expect(test.controller.getSnapshot().cursor).toBe(2);
  expect(test.controller.getSnapshot().liveReplies[0]?.text).toBe("Streaming");
  expect(test.connections).toHaveLength(1);
  test.controller.dispose();
});

it("hydrates a second Run that arrives during the first provenance read", async () => {
  const test = harness();
  await test.controller.start();
  const connection = test.connections[0]!;
  connection.onFrame({ type: "ready", version: 1 });
  connection.onFrame(messageEvent());
  let finish: (value: ConversationSnapshot) => void = () => {};
  vi.mocked(test.port.snapshot).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  connection.onFrame(runEvent("running", 2));
  const second = {
    ...run("queued"),
    id: runIdSchema.parse("run-two"),
    trigger: "routine" as const,
  };
  vi.mocked(test.port.snapshot).mockResolvedValue(
    snapshot({ runs: [run("running"), second], cursor: 3 }),
  );
  const frame = runEvent("queued", 3);
  if (frame.entry.event.kind !== "run.state") throw new Error("Expected Run event");
  connection.onFrame({ ...frame, entry: { event: { ...frame.entry.event, runId: second.id } } });
  finish(snapshot({ runs: [run("running")], cursor: 2 }));
  await vi.waitFor(() =>
    expect(test.controller.getSnapshot().runs.find((item) => item.id === second.id)?.trigger).toBe(
      "routine",
    ),
  );
  expect(test.controller.getSnapshot().cursor).toBe(3);
  test.controller.dispose();
});
