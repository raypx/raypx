import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createMyGoBridge } from "./mygo";

const streamId = "123e4567-e89b-42d3-a456-426614174000";
class Socket extends EventTarget {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  frames: Record<string, unknown>[] = [];
  message: EventListener | undefined;
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ) {
    if (type === "message" && typeof callback === "function") this.message = callback;
    else super.addEventListener(type, callback, options);
  }
  constructor(readonly url: string) {
    super();
    Socket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(data: string) {
    const frame = JSON.parse(data);
    this.frames.push(frame);
    if (frame.type === "authenticate" && !stalled)
      queueMicrotask(() => this.deliver({ type: "ready", protocol: 1, streamId }));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  deliver(data: unknown) {
    this.message?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}
let stalled = false;
beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("WebSocket", Socket);
  Socket.instances = [];
  stalled = false;
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function runtime(failure = false) {
  const call = vi.fn(async (name: string, method: unknown): Promise<unknown> => {
    if (name !== "Desktop.Request") throw new Error("old native event transport used");
    if (method === "get_channel") {
      if (failure) throw new Error("HOST_VERSION_MISMATCH");
      return {
        protocol: 1,
        url: "ws://127.0.0.1:12345/desktop",
        capability: "a".repeat(72),
        expiresAt: new Date(Date.now() + 30000).toISOString(),
      };
    }
    if (method === "get_runtime")
      return {
        appVersion: "test",
        platform: "darwin",
        trayEnabled: true,
        engine: { status: "error", code: "HOST_VERSION_MISMATCH" },
      };
    return true;
  });
  Object.defineProperty(window, "__raypxDesktopHost", { value: "mygo", configurable: true });
  window.mygo = { call: call as NonNullable<Window["mygo"]>["call"] };
  return call;
}
const nextSocket = () => Socket.instances.at(-1)!;
describe("daemon Desktop adapter", () => {
  it("sends business calls to the WebSocket and native preferences to MyGo", async () => {
    const native = runtime();
    const bridge = await createMyGoBridge(() => {});
    const result = bridge.request.localRequest({ method: "roots.list", params: {} });
    await vi.waitFor(() =>
      expect(nextSocket().frames.at(-1)).toMatchObject({
        type: "request",
        method: "local_request",
      }),
    );
    const frame = nextSocket().frames.at(-1)!;
    nextSocket().deliver({ type: "response", id: frame.id, result: [] });
    expect(await result).toEqual([]);
    await bridge.request.savePreferences({ theme: "dark", locale: "en" });
    expect(native).toHaveBeenLastCalledWith("Desktop.Request", "save_preferences", {
      theme: "dark",
      locale: "en",
    });
    expect(native.mock.calls.some(([, method]) => method === "local_request")).toBe(false);
    expect(Reflect.get(bridge.request, "unknown")).toBeUndefined();
  });
  it("ACKs dispatched events even when a listener throws and rejects stale streams", async () => {
    runtime();
    const dispatch = vi.fn();
    const bridge = await createMyGoBridge(dispatch);
    dispatch.mockImplementationOnce(() => {
      throw new Error("listener");
    });
    // Call the registered handler directly so the test can observe a listener exception.
    const socket = nextSocket();
    expect(() =>
      socket.deliver({
        type: "event",
        streamId,
        sequence: 1,
        event: { version: 1, event: "agent.changed", data: {} },
      }),
    ).toThrow("listener");
    expect(socket.frames.at(-1)).toEqual({ type: "ack", streamId, sequence: 1 });
    socket.deliver({
      type: "event",
      streamId: crypto.randomUUID(),
      sequence: 2,
      event: { version: 1, event: "agent.changed", data: {} },
    });
    expect(socket.readyState).toBe(3);
    await expect(bridge.request.savePreferences({ theme: "dark", locale: "en" })).resolves.toBe(
      true,
    );
  });
  it("cancels timed-out requests and rejects pending operations on pagehide", async () => {
    vi.useFakeTimers();
    runtime();
    const bridge = await createMyGoBridge(() => {});
    const operation = bridge.request.localRequest(
      { method: "roots.list", params: {} },
      { maxRequestTime: 100 },
    );
    const failed = operation.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await failed).toEqual(new Error("Desktop request timed out"));
    expect(nextSocket().frames.at(-1)).toMatchObject({ type: "cancel" });
    const pending = bridge.request.localRequest({ method: "roots.list", params: {} });
    const ended = pending.catch((error: unknown) => error);
    await Promise.resolve();
    window.dispatchEvent(new Event("pagehide"));
    expect(await ended).toEqual(new Error("Desktop page closed"));
    expect(nextSocket().readyState).toBe(3);
  });
  it("keeps native runtime and explicit owner recovery available after bootstrap failure", async () => {
    runtime(true);
    const bridge = await createMyGoBridge(() => {});
    expect((await bridge.request.getRuntime({})).engine.code).toBe("HOST_VERSION_MISMATCH");
    await expect(bridge.request.localRequest({ method: "roots.list", params: {} })).rejects.toThrow(
      "HOST_VERSION_MISMATCH",
    );
    await expect(bridge.request.hideWindow({})).resolves.toBe(true);
  });
  it("waits for authentication, reconnects after loss and closes the previous page", async () => {
    stalled = true;
    runtime();
    const dispatch = vi.fn();
    let initialized = false;
    const connecting = createMyGoBridge(dispatch).then((b) => {
      initialized = true;
      return b;
    });
    await vi.waitFor(() => expect(Socket.instances.length).toBe(1));
    expect(initialized).toBe(false);
    nextSocket().deliver({ type: "ready", protocol: 1, streamId });
    const bridge = await connecting;
    stalled = false;
    nextSocket().close();
    expect(dispatch).toHaveBeenLastCalledWith({
      version: 1,
      event: "engine.status",
      data: { status: "error", code: "HOST_UNAVAILABLE" },
    });
    await bridge.request.restartEngine({});
    expect(Socket.instances).toHaveLength(2);
    expect(nextSocket().frames[0]).toMatchObject({ type: "authenticate", protocol: 1 });
  });
  it("routes modified connector recovery through the bundled native CLI", async () => {
    const call = runtime();
    const bridge = await createMyGoBridge(() => {});
    await bridge.request.localRequest({
      method: "connectors.install",
      params: { provider: "codex", recoverModified: true, configDirs: { codex: "/attacker" } },
    });
    expect(call).toHaveBeenLastCalledWith("Desktop.Request", "repair_connector", {
      provider: "codex",
    });
  });
  it("retires a pending bootstrap without letting its late failure close the replacement", async () => {
    const call = runtime();
    const bridge = await createMyGoBridge(() => {});
    nextSocket().close();
    let rejectBootstrap!: (error: Error) => void;
    call.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectBootstrap = reject;
        }),
    );
    const waiting = bridge.request.localRequest({ method: "roots.list", params: {} });
    const cancelled = waiting.catch((error: unknown) => error);
    await vi.waitFor(() => expect(rejectBootstrap).toBeTypeOf("function"));
    await expect(bridge.request.restartEngine({})).resolves.toBe(true);
    expect(await cancelled).toEqual(new Error("HOST_UNAVAILABLE"));
    rejectBootstrap(new Error("late bootstrap"));
    await Promise.resolve();
    await Promise.resolve();
    expect(Socket.instances).toHaveLength(2);
    expect(nextSocket().readyState).toBe(Socket.OPEN);
  });
  it("cancels a pending authentication before replacing the channel", async () => {
    runtime();
    const bridge = await createMyGoBridge(() => {});
    nextSocket().close();
    stalled = true;
    const waiting = bridge.request.localRequest({ method: "roots.list", params: {} });
    const cancelled = waiting.catch((error: unknown) => error);
    await vi.waitFor(() => expect(Socket.instances).toHaveLength(2));
    const old = nextSocket();
    stalled = false;
    await expect(bridge.request.restartEngine({})).resolves.toBe(true);
    expect(await cancelled).toEqual(new Error("HOST_UNAVAILABLE"));
    old.deliver({ type: "ready", protocol: 1, streamId });
    old.dispatchEvent(new Event("error"));
    expect(old.readyState).toBe(3);
    expect(nextSocket().readyState).toBe(Socket.OPEN);
  });
  it("closes a page during native bootstrap and ignores a late descriptor", async () => {
    const call = runtime();
    let finish!: (value: unknown) => void;
    call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const initializing = createMyGoBridge(() => {});
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    window.dispatchEvent(new Event("pagehide"));
    const bridge = await initializing;
    finish({
      protocol: 1,
      url: "ws://127.0.0.1:12345/desktop",
      capability: "a".repeat(72),
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    });
    await Promise.resolve();
    expect(Socket.instances).toHaveLength(0);
    await expect(bridge.request.getRuntime({})).rejects.toThrow("Desktop page closed");
  });
  it("requires native preload", async () => {
    await expect(createMyGoBridge(() => {})).rejects.toThrow("DESKTOP_REQUIRED");
  });
});
