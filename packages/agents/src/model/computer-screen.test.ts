import { afterEach, expect, it, vi } from "vitest";
import { screenFixture } from "../../tests/support/screen-fixture.js";
import { computerSpaceId } from "../../tests/support/computer-fixture.js";
import type { ComputerScreenState } from "@raypx/core/computers";
const fixtures: ReturnType<typeof screenFixture>[] = [];
function fixture() {
  const f = screenFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.controller.dispose();
  fixtures.length = 0;
  vi.useRealTimers();
});

it("opens a Space-scoped stream, applies pixels before ACK and never forwards view-only input", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  expect(f.socket.send).toHaveBeenCalledWith({
    type: "screen.subscribe",
    version: 1,
    spaceId: computerSpaceId,
    viewerId: f.viewerId,
  });
  f.emit({ kind: "frame", frame: f.frame });
  expect(f.controller.getSnapshot().frame).toEqual(f.frame);
  expect(f.socket.send).toHaveBeenLastCalledWith({
    type: "screen.ack",
    version: 1,
    spaceId: computerSpaceId,
    viewerId: f.viewerId,
    sequence: 1,
  });
  f.controller.input({ kind: "text", text: "private" });
  expect(f.port.screenInput).not.toHaveBeenCalled();
});
it("takes and renews its own control, serializes input and releases it on close", async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.controller.open();
  f.ready();
  f.emit({ kind: "state", state: f.state() });
  expect(await f.controller.acquire()).toBe(true);
  expect(f.controller.controlling).toBe(true);
  f.controller.input({ kind: "text", text: "你好" });
  f.controller.input({ kind: "key", key: "Return", action: "press" });
  await vi.waitFor(() => expect(f.port.screenInput).toHaveBeenCalledTimes(2));
  await vi.advanceTimersByTimeAsync(10_000);
  expect(f.port.renewControl).toHaveBeenCalledWith({
    spaceId: computerSpaceId,
    grantId: f.grantId,
  });
  f.controller.close();
  expect(f.socket.close).toHaveBeenCalled();
  expect(f.port.releaseControl).toHaveBeenCalledWith({
    spaceId: computerSpaceId,
    grantId: f.grantId,
  });
  expect(f.controller.getSnapshot().frame).toBeNull();
});
it("does not treat another tab of the same member as this controller", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  const state = {
    status: "available" as const,
    running: true,
    width: 640,
    height: 480,
    control: {
      id: f.grantId,
      accountId: "member",
      displayName: "Member",
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    },
    agentInputPaused: true,
    canForceRelease: true,
  };
  f.emit({ kind: "state", state });
  expect(f.controller.controlling).toBe(false);
  f.controller.close();
  expect(f.port.releaseControl).not.toHaveBeenCalled();
});
it("clears frames and control on membership loss without reconnecting", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  f.emit({ kind: "frame", frame: f.frame });
  await f.controller.acquire();
  f.close();
  expect(f.controller.getSnapshot()).toMatchObject({
    frame: null,
    connected: false,
    error: "SPACE_MEMBER_REMOVED",
  });
  expect(f.controller.controlling).toBe(false);
});
it("discards a late availability result after the surface closes", async () => {
  const f = fixture();
  const result = f.deferred<ReturnType<typeof f.state>>();
  vi.mocked(f.port.screenAvailability).mockReturnValue(result.promise);
  const open = f.controller.open();
  f.controller.close();
  result.resolve(f.state());
  await open;
  expect(f.controller.getSnapshot().state).toBeNull();
  expect(f.sockets.connect).not.toHaveBeenCalled();
});
it("pauses viewing and releases input before disconnecting", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  f.emit({ kind: "state", state: f.state() });
  await f.controller.acquire();
  await f.controller.togglePause();
  expect(f.port.releaseControl).toHaveBeenCalledOnce();
  expect(f.socket.close).toHaveBeenCalledOnce();
  expect(f.controller.getSnapshot()).toMatchObject({ paused: true, frame: null, connected: false });
});
it("handles a synchronous ready callback after binding the returned socket", async () => {
  const f = fixture();
  vi.mocked(f.sockets.connect).mockImplementation((callbacks) => {
    callbacks.onFrame({ type: "ready", version: 1 });
    return f.socket;
  });
  await f.controller.open();
  expect(f.socket.send).toHaveBeenCalledExactlyOnceWith({
    type: "screen.subscribe",
    version: 1,
    spaceId: computerSpaceId,
    viewerId: f.viewerId,
  });
});
it("does not resurrect a socket that closes synchronously during connection", async () => {
  const f = fixture();
  vi.mocked(f.sockets.connect).mockImplementation((callbacks) => {
    callbacks.onClose(4001, "SESSION_ENDED");
    return f.socket;
  });
  await f.controller.open();
  expect(f.socket.close).toHaveBeenCalledOnce();
  expect(f.controller.getSnapshot()).toMatchObject({
    connected: false,
    frame: null,
    error: "SESSION_ENDED",
  });
});
it("ignores every old-socket callback after reconnect even if its viewer ID is reused", async () => {
  const f = fixture();
  await f.controller.open();
  const first = vi.mocked(f.sockets.connect).mock.calls[0]![0];
  f.ready();
  await f.controller.togglePause();
  await f.controller.togglePause();
  f.ready();
  f.emit({ kind: "frame", frame: f.frame });
  const before = f.controller.getSnapshot();
  const sent = vi.mocked(f.socket.send).mock.calls.length;
  first.onFrame({ type: "ready", version: 1 });
  first.onFrame({
    type: "screen.event",
    spaceId: computerSpaceId,
    viewerId: f.viewerId,
    sequence: 90,
    event: { kind: "frame", frame: { ...f.frame, sequence: 90 } },
  });
  first.onError();
  first.onClose(4003, "SPACE_MEMBER_REMOVED");
  expect(f.controller.getSnapshot()).toBe(before);
  expect(f.socket.send).toHaveBeenCalledTimes(sent);
});
it("releases an acquired grant whose response arrives after its viewing connection closes", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  f.emit({ kind: "state", state: f.state() });
  await f.controller.acquire();
  const acquired = f.state();
  await f.controller.release();
  const result = f.deferred<ComputerScreenState>();
  vi.mocked(f.port.acquireControl).mockReturnValue(result.promise);
  vi.mocked(f.port.releaseControl).mockClear();
  const acquire = f.controller.acquire();
  f.close();
  result.resolve(acquired);
  expect(await acquire).toBe(false);
  expect(f.controller.controlling).toBe(false);
  expect(f.port.releaseControl).toHaveBeenCalledExactlyOnceWith({
    spaceId: computerSpaceId,
    grantId: f.grantId,
  });
  expect(f.controller.getSnapshot().error).toBe("SPACE_MEMBER_REMOVED");
});
it("keeps an owned grant selector across a delayed state sampled before acquisition", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  const beforeAcquire = f.state();
  f.emit({ kind: "state", state: beforeAcquire });
  await f.controller.acquire();
  const acquired = f.state();
  f.emit({ kind: "state", state: beforeAcquire });
  expect(f.controller.controlling).toBe(false);
  f.emit({ kind: "state", state: acquired });
  expect(f.controller.controlling).toBe(true);
});
it("discards a pending availability result after a command applies newer state", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  f.emit({ kind: "state", state: f.state() });
  const result = f.deferred<ComputerScreenState>();
  vi.mocked(f.port.screenAvailability).mockReturnValue(result.promise);
  const refresh = f.controller.refresh();
  await f.controller.acquire();
  result.resolve({ status: "not-running", state: "stopped" });
  await refresh;
  expect(f.controller.controlling).toBe(true);
  expect(f.socket.close).not.toHaveBeenCalled();
});
it("flushes admitted input and ignores a late refusal from a previous connection", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  f.emit({ kind: "state", state: f.state() });
  await f.controller.acquire();
  const result = f.deferred<{ accepted: true }>();
  vi.mocked(f.port.screenInput).mockReturnValue(result.promise);
  f.controller.input({ kind: "pointer", x: 4, y: 4, action: "up", button: "left" });
  const flushed = vi.fn();
  const flush = f.controller.flushInput().then(flushed);
  await vi.waitFor(() => expect(f.port.screenInput).toHaveBeenCalledOnce());
  expect(flushed).not.toHaveBeenCalled();
  f.controller.close();
  await f.controller.open();
  f.ready();
  f.emit({ kind: "frame", frame: f.frame });
  const before = f.controller.getSnapshot();
  result.reject(new Error("Old input refused"));
  await flush;
  expect(flushed).toHaveBeenCalledOnce();
  expect(f.controller.getSnapshot()).toBe(before);
});

it.each(["event", "transport"] as const)(
  "reconciles a %s stop without a preceding state frame and rechecks availability",
  async (source) => {
    const f = fixture();
    await f.controller.open();
    f.ready();
    f.emit({ kind: "frame", frame: f.frame });
    await f.controller.acquire();
    const result = f.deferred<ComputerScreenState>();
    vi.mocked(f.port.screenAvailability).mockReturnValueOnce(result.promise);
    if (source === "event") f.emit({ kind: "closed", reason: "SCREEN_STOPPED" });
    else f.close("SCREEN_STOPPED");
    expect(f.controller.getSnapshot()).toMatchObject({
      state: { status: "available", running: false, control: null, agentInputPaused: false },
      frame: null,
      connected: false,
      error: "SCREEN_STOPPED",
    });
    expect(f.controller.controlling).toBe(false);
    f.controller.input({ kind: "text", text: "refused after stop" });
    expect(f.port.screenInput).not.toHaveBeenCalled();
    expect(f.port.screenAvailability).toHaveBeenCalledTimes(2);
    const stopped: ComputerScreenState = {
      ...(f.state() as Extract<ComputerScreenState, { status: "available" }>),
      running: false,
      control: null,
      agentInputPaused: false,
    };
    result.resolve(stopped);
    await vi.waitFor(() => expect(f.controller.getSnapshot().error).toBeNull());
    expect(f.controller.getSnapshot().state).toEqual(stopped);
    expect(f.sockets.connect).toHaveBeenCalledOnce();
  },
);
it("does not let a stop reconciliation overwrite a later successful restart", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  f.emit({ kind: "frame", frame: f.frame });
  const result = f.deferred<ComputerScreenState>();
  vi.mocked(f.port.screenAvailability).mockReturnValueOnce(result.promise);
  f.emit({ kind: "closed", reason: "SCREEN_STOPPED" });
  expect(await f.controller.start()).toBe(true);
  result.resolve({
    ...(f.state() as Extract<ComputerScreenState, { status: "available" }>),
    running: false,
  });
  await result.promise;
  expect(f.controller.getSnapshot().state).toMatchObject({ status: "available", running: true });
  expect(f.sockets.connect).toHaveBeenCalledTimes(2);
});
it("discards stop reconciliation availability after the screen surface closes", async () => {
  const f = fixture();
  await f.controller.open();
  f.ready();
  const result = f.deferred<ComputerScreenState>();
  vi.mocked(f.port.screenAvailability).mockReturnValueOnce(result.promise);
  f.emit({ kind: "closed", reason: "SCREEN_STOPPED" });
  f.controller.close();
  result.resolve(f.state());
  await result.promise;
  expect(f.controller.getSnapshot().state).toBeNull();
  expect(f.sockets.connect).toHaveBeenCalledOnce();
});
