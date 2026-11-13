import { afterEach, expect, it, vi } from "vitest";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { spaceIdSchema, type SpaceEvent } from "@raypx/core/spaces";
import type { ConversationSocketPort, SpaceMembership } from "./port.js";
import { SpaceLiveController } from "./space-live.js";

const spaceId = spaceIdSchema.parse("team");
const createdAt = "2026-11-14T00:00:00.000Z";
const joinedAt = "2026-11-13T00:00:00.000Z";
const membership: SpaceMembership = {
  space: { id: spaceId, name: "Team", createdAt: joinedAt, updatedAt: joinedAt },
  member: { spaceId, accountId: "viewer", role: "member", createdAt: joinedAt },
};
const controllers: SpaceLiveController[] = [];
function fixture() {
  const connections: Array<Parameters<ConversationSocketPort["connect"]>[0]> = [];
  const frames: ConversationClientFrame[] = [];
  const close = vi.fn();
  const list = vi.fn(async (): Promise<SpaceMembership[]> => [membership]);
  const onMemberships = vi.fn();
  const onEvent = vi.fn<(event: SpaceEvent) => void | Promise<void>>();
  const onExit = vi.fn();
  const socket: ConversationSocketPort = {
    connect(callbacks) {
      connections.push(callbacks);
      return {
        send(frame) {
          frames.push(frame);
        },
        close,
      };
    },
  };
  const controller = new SpaceLiveController({
    spaceId,
    accountId: "viewer",
    socket,
    list,
    onMemberships,
    onEvent,
    onExit,
  });
  controllers.push(controller);
  return { controller, connections, frames, close, list, onMemberships, onEvent, onExit, socket };
}
function frame(id: number, kind: "space.renamed", name: string): ConversationServerFrame;
function frame(
  id: number,
  kind: "space.member.removed",
  accountId: string,
): ConversationServerFrame;
function frame(
  id: number,
  kind: "space.renamed" | "space.member.removed",
  value: string,
): ConversationServerFrame {
  const event: SpaceEvent =
    kind === "space.renamed"
      ? { id, spaceId, kind, createdAt, payload: { name: value } }
      : { id, spaceId, kind, createdAt, payload: { accountId: value } };
  return { type: "space.event", spaceId, event };
}
async function settle() {
  // Queued transport frames, membership reads and their explicit applications settle.
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.useRealTimers();
});

it.each(["page.created", "page.updated", "page.deleted"] as const)(
  "ACKs %s without applying it to membership state, then processes membership events",
  async (kind) => {
    const h = fixture();
    h.controller.start();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    await settle();
    h.connections[0]!.onFrame({
      type: "space.event",
      spaceId,
      event: { id: 1, spaceId, kind, createdAt, payload: { pageId: "page", version: 1 } },
    });
    await settle();
    expect(h.onEvent).not.toHaveBeenCalled();
    expect(h.onExit).not.toHaveBeenCalled();
    expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.ack", spaceId, sequence: 1 });
    const role: SpaceEvent = {
      id: 2,
      spaceId,
      kind: "space.member.role_changed",
      createdAt,
      payload: { accountId: "viewer", role: "owner" },
    };
    h.connections[0]!.onFrame({ type: "space.event", spaceId, event: role });
    await settle();
    expect(h.onEvent).toHaveBeenCalledExactlyOnceWith(role);
    expect(h.onExit).not.toHaveBeenCalled();
    expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.ack", spaceId, sequence: 2 });
  },
);

it.each(["space.member.joined", "space.member.role_changed"] as const)(
  "ignores historical %s for a rejoined member",
  async (kind) => {
    const h = fixture();
    h.list.mockResolvedValue([{ ...membership, member: { ...membership.member, createdAt } }]);
    h.controller.start();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    await settle();
    const event: SpaceEvent =
      kind === "space.member.joined"
        ? { id: 1, spaceId, kind, createdAt: joinedAt, payload: { accountId: "viewer" } }
        : {
            id: 1,
            spaceId,
            kind,
            createdAt: joinedAt,
            payload: { accountId: "viewer", role: "member" },
          };
    h.connections[0]!.onFrame({ type: "space.event", spaceId, event });
    await settle();
    expect(h.onEvent).not.toHaveBeenCalled();
    expect(h.onExit).not.toHaveBeenCalled();
    expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.ack", spaceId, sequence: 1 });
  },
);

it("reconciles at startup and ready, then subscribes to the selected Space", async () => {
  const h = fixture();
  h.controller.start();
  await settle();
  expect(h.list).toHaveBeenCalledOnce();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  expect(h.list).toHaveBeenCalledTimes(2);
  expect(h.frames).toEqual([{ version: 1, type: "space.subscribe", spaceId, after: 0 }]);
  expect(h.onMemberships).toHaveBeenLastCalledWith([membership]);
  h.controller.start();
  expect(h.connections).toHaveLength(1);
});

it("ACKs only after state application and serializes later events", async () => {
  const h = fixture();
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  let applied!: () => void;
  h.onEvent.mockReturnValueOnce(
    new Promise((resolve) => {
      applied = resolve;
    }),
  );
  h.connections[0]!.onFrame(frame(1, "space.renamed", "First"));
  h.connections[0]!.onFrame(frame(2, "space.renamed", "Second"));
  await settle();
  expect(h.onEvent).toHaveBeenCalledOnce();
  expect(h.frames).toHaveLength(1);
  applied();
  await settle();
  expect(h.onEvent).toHaveBeenCalledTimes(2);
  expect(h.frames.slice(1)).toEqual([
    { version: 1, type: "space.ack", spaceId, sequence: 1 },
    { version: 1, type: "space.ack", spaceId, sequence: 2 },
  ]);
  h.connections[0]!.onFrame(frame(1, "space.renamed", "Old"));
  await settle();
  expect(h.onEvent).toHaveBeenCalledTimes(2);
});

it("reconnects after a transport failure from the last applied cursor", async () => {
  vi.useFakeTimers();
  const h = fixture();
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  h.connections[0]!.onFrame(frame(5, "space.renamed", "New"));
  await settle();
  h.connections[0]!.onClose(1006);
  await settle();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(h.connections).toHaveLength(2);
  h.connections[1]!.onFrame({ type: "ready", version: 1 });
  await settle();
  expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.subscribe", spaceId, after: 5 });
  h.connections[0]!.onFrame(frame(9, "space.renamed", "Stale socket"));
  await settle();
  expect(h.onEvent).toHaveBeenCalledOnce();
});

it("uses fresh discovery to leave a deleted or removed Space during reconnection", async () => {
  vi.useFakeTimers();
  const h = fixture();
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  h.list.mockResolvedValueOnce([]);
  h.connections[0]!.onClose(1006);
  await settle();
  expect(h.onExit).toHaveBeenCalledExactlyOnceWith("unavailable");
  await vi.advanceTimersByTimeAsync(5_000);
  expect(h.connections).toHaveLength(1);
  h.controller.start();
  expect(h.connections).toHaveLength(1);
});

it("immediately exits once on the current member removal and closes its stream", async () => {
  vi.useFakeTimers();
  const h = fixture();
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  h.connections[0]!.onFrame(frame(1, "space.member.removed", "viewer"));
  h.connections[0]!.onFrame(frame(2, "space.member.removed", "viewer"));
  await settle();
  expect(h.onExit).toHaveBeenCalledExactlyOnceWith("removed");
  expect(h.close).toHaveBeenCalledOnce();
  expect(h.onEvent).not.toHaveBeenCalled();
  expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.unsubscribe", spaceId });
  await vi.advanceTimersByTimeAsync(5_000);
  expect(h.connections).toHaveLength(1);
});

it("leaves immediately for an authentication close without retrying", async () => {
  vi.useFakeTimers();
  const h = fixture();
  h.controller.start();
  await settle();
  h.connections[0]!.onClose(4001);
  expect(h.onExit).toHaveBeenCalledExactlyOnceWith("unavailable");
  await vi.advanceTimersByTimeAsync(5_000);
  expect(h.connections).toHaveLength(1);
});

it("does not evict a rejoined member from a historical removal, or replay stale names", async () => {
  const h = fixture();
  h.list.mockResolvedValue([
    {
      ...membership,
      space: { ...membership.space, name: "Current", updatedAt: createdAt },
      member: { ...membership.member, createdAt },
    },
  ]);
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  h.connections[0]!.onFrame({
    type: "space.event",
    spaceId,
    event: {
      id: 1,
      spaceId,
      kind: "space.member.removed",
      createdAt: joinedAt,
      payload: { accountId: "viewer" },
    },
  });
  h.connections[0]!.onFrame({
    type: "space.event",
    spaceId,
    event: {
      id: 2,
      spaceId,
      kind: "space.renamed",
      createdAt: joinedAt,
      payload: { name: "Old name" },
    },
  });
  await settle();
  expect(h.onExit).not.toHaveBeenCalled();
  expect(h.onEvent).not.toHaveBeenCalled();
  expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.ack", spaceId, sequence: 2 });
});

it("never ACKs a failed application and replays it after reconnect", async () => {
  vi.useFakeTimers();
  const h = fixture();
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  h.onEvent.mockRejectedValueOnce(new Error("directory unavailable"));
  h.connections[0]!.onFrame(frame(1, "space.renamed", "New"));
  await settle();
  expect(h.frames.filter((entry) => entry.type === "space.ack")).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1_000);
  h.connections[1]!.onFrame({ type: "ready", version: 1 });
  await settle();
  expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.subscribe", spaceId, after: 0 });
  h.connections[1]!.onFrame(frame(1, "space.renamed", "New"));
  await settle();
  expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.ack", spaceId, sequence: 1 });
});

it("fences stale membership discovery on disposal and after a newer read", async () => {
  const h = fixture();
  let finish!: (value: SpaceMembership[]) => void;
  h.list.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  h.controller.start();
  await h.controller.reconcile();
  expect(h.onMemberships).toHaveBeenCalledOnce();
  finish([]);
  await settle();
  expect(h.onExit).not.toHaveBeenCalled();
  expect(h.onMemberships).toHaveBeenCalledOnce();
  h.list.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const reading = h.controller.reconcile();
  h.controller.dispose();
  finish([]);
  await reading;
  expect(h.onExit).not.toHaveBeenCalled();
  expect(h.onMemberships).toHaveBeenCalledOnce();
});

it("unsubscribes once and closes even if sending unsubscribe throws", async () => {
  const h = fixture();
  const close = vi.fn();
  h.socket.connect = () => ({
    send() {
      throw new Error("closed");
    },
    close,
  });
  h.controller.start();
  await settle();
  h.controller.dispose();
  h.controller.dispose();
  expect(close).toHaveBeenCalledOnce();
});

it("supports synchronous transport ready callbacks and ignores other Space frames", async () => {
  const h = fixture();
  h.socket.connect = (callbacks) => {
    h.connections.push(callbacks);
    callbacks.onFrame({ type: "ready", version: 1 });
    return {
      send(outgoingFrame) {
        h.frames.push(outgoingFrame);
      },
      close: h.close,
    };
  };
  h.controller.start();
  await settle();
  expect(h.frames.at(-1)?.type).toBe("space.subscribe");
  const foreign = frame(1, "space.renamed", "Foreign");
  if (foreign.type !== "space.event") throw new Error("Invalid fixture");
  h.connections[0]!.onFrame({ ...foreign, spaceId: spaceIdSchema.parse("other") });
  await settle();
  expect(h.onEvent).not.toHaveBeenCalled();
});

it("subscribes to every listed Space and applies sidebar renames with independent cursors", async () => {
  const h = fixture();
  const otherId = spaceIdSchema.parse("other");
  const other: SpaceMembership = {
    space: { ...membership.space, id: otherId, name: "Other" },
    member: { ...membership.member, spaceId: otherId },
  };
  h.list.mockResolvedValue([membership, other]);
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  expect(h.frames).toEqual([
    { version: 1, type: "space.subscribe", spaceId, after: 0 },
    { version: 1, type: "space.subscribe", spaceId: otherId, after: 0 },
  ]);
  const rename: SpaceEvent = {
    id: 7,
    spaceId: otherId,
    kind: "space.renamed",
    createdAt,
    payload: { name: "Other renamed" },
  };
  h.connections[0]!.onFrame({ type: "space.event", spaceId: otherId, event: rename });
  h.connections[0]!.onFrame(frame(1, "space.renamed", "Current renamed"));
  await settle();
  expect(h.onEvent).toHaveBeenCalledWith(rename);
  expect(h.frames.slice(-2)).toEqual([
    { version: 1, type: "space.ack", spaceId: otherId, sequence: 7 },
    { version: 1, type: "space.ack", spaceId, sequence: 1 },
  ]);
});

it("refreshes all memberships after 4003 without leaving a still-accessible current Space", async () => {
  vi.useFakeTimers();
  const h = fixture();
  const otherId = spaceIdSchema.parse("other");
  const other: SpaceMembership = {
    space: { ...membership.space, id: otherId },
    member: { ...membership.member, spaceId: otherId },
  };
  h.list.mockResolvedValue([membership, other]);
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  h.list.mockResolvedValue([membership]);
  h.connections[0]!.onClose(4003);
  await settle();
  expect(h.onMemberships).toHaveBeenLastCalledWith([membership]);
  expect(h.onExit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1_000);
  h.connections[1]!.onFrame({ type: "ready", version: 1 });
  await settle();
  expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.subscribe", spaceId, after: 0 });
  expect(
    h.frames.filter((entry) => entry.type === "space.subscribe" && entry.spaceId === otherId),
  ).toHaveLength(1);
});

it("leaves on 4003 when fresh membership confirms the selected Space is gone", async () => {
  vi.useFakeTimers();
  const h = fixture();
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  h.list.mockResolvedValue([]);
  h.connections[0]!.onClose(4003);
  await settle();
  expect(h.onExit).toHaveBeenCalledExactlyOnceWith("unavailable");
  await vi.advanceTimersByTimeAsync(5_000);
  expect(h.connections).toHaveLength(1);
});

it("adds and removes background subscriptions after explicit membership reconciliation", async () => {
  const h = fixture();
  const otherId = spaceIdSchema.parse("other");
  const other: SpaceMembership = {
    space: { ...membership.space, id: otherId },
    member: { ...membership.member, spaceId: otherId },
  };
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  h.list.mockResolvedValue([membership, other]);
  await h.controller.reconcile();
  expect(h.frames.at(-1)).toEqual({
    version: 1,
    type: "space.subscribe",
    spaceId: otherId,
    after: 0,
  });
  h.list.mockResolvedValue([membership]);
  await h.controller.reconcile();
  expect(h.frames.at(-1)).toEqual({ version: 1, type: "space.unsubscribe", spaceId: otherId });
  expect(h.onExit).not.toHaveBeenCalled();
});

it("does not let an older discovery response undo an applied rename", async () => {
  const h = fixture();
  h.controller.start();
  h.connections[0]!.onFrame({ type: "ready", version: 1 });
  await settle();
  const before = h.onMemberships.mock.calls.length;
  let finish!: (value: SpaceMembership[]) => void;
  h.list.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const reading = h.controller.reconcile();
  h.connections[0]!.onFrame(frame(1, "space.renamed", "Latest"));
  await settle();
  expect(h.onEvent).toHaveBeenCalledOnce();
  finish([membership]);
  await reading;
  expect(h.onMemberships).toHaveBeenCalledTimes(before);
});
