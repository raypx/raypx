import { afterEach, expect, it, vi } from "vitest";
import type { ComputerScreensService } from "@raypx/computers/server";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import type { ComputerScreenEvent, ComputerScreenState } from "@raypx/core/computers";
import { SpaceNotFound, spaceIdSchema } from "@raypx/core/spaces";
import { spaceStreamFixture } from "../../tests/helpers/space-stream.js";
import { ConversationStream } from "./stream.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const screen: ComputerScreenState = {
  status: "available",
  running: true,
  width: 1024,
  height: 768,
  control: null,
  agentInputPaused: false,
  canForceRelease: true,
};
function frame(sequence: number): ComputerScreenEvent {
  return {
    kind: "frame",
    frame: { sequence, width: 1024, height: 768, mimeType: "image/png", bytes: "iVBORw0KGgo=" },
  };
}
async function fixture(events: ComputerScreenEvent[] = [frame(30), frame(31)]) {
  const base = spaceStreamFixture();
  const resolve = vi.spyOn(base.spaces, "resolve");
  const finalized = vi.fn<(viewerId: string) => void>();
  const produced = vi.fn<(viewerId: string) => void>();
  const beforeFrame = vi.fn<() => void>();
  const service: ComputerScreensService = {
    availability: async () => screen,
    start: async () => screen,
    stop: async () => screen,
    acquire: async () => screen,
    renew: async () => screen,
    release: async () => screen,
    forceRelease: async () => screen,
    input: async () => screen,
    withAgentInput: async (_scope, _ref, operation) => operation(),
    async *stream(scope, options) {
      expect(scope).toEqual(base.scope);
      try {
        for (const event of events) {
          beforeFrame();
          produced(options.viewerId);
          yield event;
        }
        await new Promise<void>((finish) => {
          if (options.signal?.aborted) finish();
          else options.signal?.addEventListener("abort", () => finish(), { once: true });
        });
      } finally {
        finalized(options.viewerId);
      }
    },
  };
  const stream = new ConversationStream({ ...base, screens: service, pollMs: 10 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const frames: ConversationServerFrame[] = [];
  const close = vi.fn();
  stream.open("screen-peer", "member", new Headers(), {
    send: (value) => frames.push(value),
    close,
  });
  const viewerId = crypto.randomUUID();
  const selection = { version: 1 as const, spaceId: base.spaceId, viewerId };
  function send(value: ConversationClientFrame) {
    stream.receive("screen-peer", JSON.stringify(value));
  }
  const received = () =>
    frames.filter(
      (value): value is Extract<ConversationServerFrame, { type: "screen.event" }> =>
        value.type === "screen.event",
    );
  const subscribe = () => send({ ...selection, type: "screen.subscribe" });
  const ack = (sequence: number) => send({ ...selection, type: "screen.ack", sequence });
  return {
    ...base,
    resolve,
    stream,
    service,
    frames,
    close,
    viewerId,
    selection,
    send,
    subscribe,
    ack,
    received,
    produced,
    finalized,
    beforeFrame,
  };
}

it("delivers bounded screen frames in order only after their exact applied ACK", async () => {
  const f = await fixture([frame(30), frame(31), { kind: "closed", reason: "SCREEN_STOPPED" }]);
  f.subscribe();
  await expect.poll(() => f.received().map((value) => value.sequence)).toEqual([1]);
  expect(f.produced).toHaveBeenCalledTimes(1);
  expect(f.received()[0]).toMatchObject({
    viewerId: f.viewerId,
    spaceId: f.spaceId,
    event: { kind: "frame", frame: { sequence: 30 } },
  });
  f.ack(1);
  await expect.poll(() => f.received().map((value) => value.sequence)).toEqual([1, 2]);
  f.ack(2);
  await expect.poll(() => f.received().map((value) => value.sequence)).toEqual([1, 2, 3]);
  expect(f.received()[2]!.event).toEqual({ kind: "closed", reason: "SCREEN_STOPPED" });
  f.ack(3);
  await expect.poll(() => f.finalized.mock.calls).toEqual([[f.viewerId]]);
  expect(f.close).not.toHaveBeenCalled();
});

it("refuses foreign Space selectors before invoking the screen source", async () => {
  const f = await fixture();
  f.send({ ...f.selection, type: "screen.subscribe", spaceId: spaceIdSchema.parse("foreign") });
  await expect.poll(() => f.close.mock.calls).toEqual([[4003, "Subscription unavailable"]]);
  expect(f.produced).not.toHaveBeenCalled();
  expect(f.received()).toEqual([]);
});

it("rechecks membership after a source prepares a frame and before any private image is delivered", async () => {
  const f = await fixture();
  f.beforeFrame.mockImplementationOnce(() => {
    f.resolve.mockRejectedValue(new SpaceNotFound("SPACE_MEMBER_REMOVED"));
  });
  f.subscribe();
  await expect.poll(() => f.close.mock.calls).toEqual([[4003, "SPACE_MEMBER_REMOVED"]]);
  expect(f.received()).toEqual([]);
  await expect.poll(() => f.finalized.mock.calls).toEqual([[f.viewerId]]);
});

it("periodically revokes idle screen streams and ones waiting for an ACK", async () => {
  const f = await fixture([]);
  f.subscribe();
  await expect.poll(() => f.resolve.mock.calls.length).toBeGreaterThan(1);
  f.resolve.mockRejectedValue(new SpaceNotFound("SPACE_MEMBER_LEFT"));
  await expect.poll(() => f.close.mock.calls).toEqual([[4003, "SPACE_MEMBER_LEFT"]]);
  await expect.poll(() => f.finalized.mock.calls).toEqual([[f.viewerId]]);
  const g = await fixture();
  g.subscribe();
  await expect.poll(() => g.received().length).toBe(1);
  g.signOut();
  await expect.poll(() => g.close.mock.calls).toEqual([[4001, "SESSION_ENDED"]]);
  await expect.poll(() => g.finalized.mock.calls).toEqual([[g.viewerId]]);
  expect(g.received()).toHaveLength(1);
});

it.each(["removed", "left", "deleted"] as const)(
  "actively closes a screen-only subscriber with the precise %s reason",
  async (reason) => {
    const f = await fixture();
    f.subscribe();
    await expect.poll(() => f.received().length).toBe(1);
    if (reason === "deleted") f.deleteSpaceActively();
    else f.removeMemberActively(reason);
    const expected = {
      removed: "SPACE_MEMBER_REMOVED",
      left: "SPACE_MEMBER_LEFT",
      deleted: "SPACE_DELETING",
    };
    expect(f.close).toHaveBeenCalledExactlyOnceWith(4003, expected[reason]);
    await expect.poll(() => f.finalized.mock.calls).toEqual([[f.viewerId]]);
  },
);

it.each(["sequence", "viewer", "second-subscription"] as const)(
  "refuses a forged %s screen frame",
  async (invalid) => {
    const f = await fixture();
    f.subscribe();
    await expect.poll(() => f.received().length).toBe(1);
    if (invalid === "second-subscription") f.subscribe();
    else
      f.send({
        ...f.selection,
        type: "screen.ack",
        sequence: invalid === "sequence" ? 2 : 1,
        viewerId: invalid === "viewer" ? crypto.randomUUID() : f.viewerId,
      });
    expect(f.close).toHaveBeenCalledExactlyOnceWith(4000, "Invalid frame");
  },
);

it("rejects an oversized source frame without sending image content", async () => {
  const event = frame(0);
  if (event.kind !== "frame") throw new Error("Expected frame");
  event.frame.bytes = Buffer.alloc(1_200_000).toString("base64");
  const f = await fixture([event]);
  f.subscribe();
  await expect.poll(() => f.close.mock.calls).toEqual([[1013, "Stream unavailable"]]);
  expect(f.received()).toEqual([]);
  await expect.poll(() => f.finalized.mock.calls).toEqual([[f.viewerId]]);
});

it("aborts only the bound viewer when another viewing connection closes", async () => {
  const f = await fixture();
  const secondFrames: ConversationServerFrame[] = [];
  const secondViewer = crypto.randomUUID();
  const secondClose = vi.fn();
  f.stream.open("second-viewer", "member", new Headers(), {
    send: (value) => secondFrames.push(value),
    close: secondClose,
  });
  f.subscribe();
  f.stream.receive(
    "second-viewer",
    JSON.stringify({ ...f.selection, type: "screen.subscribe", viewerId: secondViewer }),
  );
  await expect.poll(() => f.received().length).toBe(1);
  await expect
    .poll(() => secondFrames.filter((value) => value.type === "screen.event").length)
    .toBe(1);
  f.stream.close("second-viewer");
  await expect.poll(() => f.finalized.mock.calls).toEqual([[secondViewer]]);
  f.ack(1);
  await expect.poll(() => f.received().length).toBe(2);
  expect(f.close).not.toHaveBeenCalled();
  f.send({ ...f.selection, type: "screen.unsubscribe" });
  await expect.poll(() => f.finalized.mock.calls).toEqual([[secondViewer], [f.viewerId]]);
});
