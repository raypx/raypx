import { afterEach, expect, it, vi } from "vite-plus/test";
import type { RelayClientFrame } from "@raypx/contracts/tasks";
import { relayFixture } from "../../tests/helpers/relay.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of cleanups.splice(0)) await close();
});

function events(
  f: Awaited<ReturnType<typeof relayFixture>>,
): Extract<RelayClientFrame, { type: "events" }> {
  return {
    type: "events",
    streamId: f.announce.streamId,
    events: [
      {
        sequence: 2,
        event: {
          id: crypto.randomUUID(),
          taskId: f.task.id,
          kind: "status",
          status: "running",
          summary: "Private output after session revocation",
          task: { ...f.task, summary: "Private output after session revocation" },
        },
      },
    ],
  };
}

it.each([false, true])(
  "revalidates passive viewers before broadcasting (clustered=%s)",
  async (clustered) => {
    const f = await relayFixture(clustered);
    cleanups.push(f.close);
    const revoked = await f.viewer(),
      active = await f.viewer(),
      frame = events(f);
    f.repository.inactiveSessions.add(revoked.sessionId);
    await f.control.credentials.revokeHostAuthorizations(f.auth.user.id, revoked.sessionId);
    await f.device.receive(frame);
    expect(revoked.frames).toEqual([]);
    expect(revoked.close).toHaveBeenCalledWith(4001, "AUTH_REQUIRED");
    expect(active.frames).toContainEqual({
      type: "changed",
      deviceId: f.grant.deviceId,
      streamId: frame.streamId,
      sequence: 2,
      events: frame.events,
    });
    expect(active.close).not.toHaveBeenCalled();
    expect(f.device.close).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "isolates viewer validation failures from other peers (clustered=%s)",
  async (clustered) => {
    const f = await relayFixture(clustered);
    cleanups.push(f.close);
    const unavailable = await f.viewer(),
      active = await f.viewer(),
      validate = f.control.credentials.validate.bind(f.control.credentials);
    vi.spyOn(f.control.credentials, "validate").mockImplementation(async (actor) => {
      if (actor.sessionId === unavailable.sessionId) throw new Error("private repository failure");
      return validate(actor);
    });
    await f.device.receive(events(f));
    expect(unavailable.frames).toEqual([]);
    expect(unavailable.close).toHaveBeenCalledWith(1011, "SERVER_UNAVAILABLE");
    expect(active.frames.some((frame) => frame.type === "changed")).toBe(true);
    expect(active.close).not.toHaveBeenCalled();
    expect(f.device.close).not.toHaveBeenCalled();
  },
);

it("does not delay active viewers behind another viewer's pending validation or send after disconnect", async () => {
  const f = await relayFixture();
  cleanups.push(f.close);
  const delayed = await f.viewer(),
    active = await f.viewer(),
    validate = f.control.credentials.validate.bind(f.control.credentials);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    started = new Promise<void>((resolve) => (entered = resolve));
  vi.spyOn(f.control.credentials, "validate").mockImplementation(async (actor) => {
    if (actor.sessionId === delayed.sessionId) {
      entered();
      await gate;
    }
    return validate(actor);
  });
  const pending = f.device.receive(events(f));
  let closing: Promise<void> | undefined;
  try {
    await Promise.race([started, pending]);
    await expect.poll(() => active.frames.some((frame) => frame.type === "changed")).toBe(true);
    closing = f.viewerHub.close(delayed.id);
  } finally {
    release();
    await Promise.all([pending, closing]);
  }
  expect(delayed.frames).toEqual([]);
  expect(f.device.close).not.toHaveBeenCalled();
});

it("preserves each viewer's event order during concurrent cluster notices", async () => {
  const f = await relayFixture(true);
  cleanups.push(f.close);
  const delayed = await f.viewer(),
    active = await f.viewer(),
    validate = f.control.credentials.validate.bind(f.control.credentials);
  let release!: () => void,
    entered!: () => void,
    calls = 0;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    started = new Promise<void>((resolve) => (entered = resolve));
  vi.spyOn(f.control.credentials, "validate").mockImplementation(async (actor) => {
    if (actor.sessionId === delayed.sessionId && calls++ === 0) {
      entered();
      await gate;
    }
    return validate(actor);
  });
  const publish = (sequence: number) =>
    f.publish({
      type: "changed",
      userId: f.auth.user.id,
      frame: {
        type: "changed",
        deviceId: f.grant.deviceId,
        streamId: f.announce.streamId,
        sequence,
        events: events(f).events.map((entry) => ({ ...entry, sequence })),
      },
    });
  const first = publish(2);
  await started;
  const second = publish(3);
  try {
    await expect
      .poll(() => active.frames.some((frame) => frame.type === "changed" && frame.sequence === 3))
      .toBe(true);
  } finally {
    release();
    await Promise.all([first, second]);
  }
  expect(
    delayed.frames.filter((frame) => frame.type === "changed").map((frame) => frame.sequence),
  ).toEqual([2, 3]);
});
