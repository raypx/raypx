import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createMyGoBridge } from "../../../../src/lib/mygo";

beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  Reflect.deleteProperty(window, "mygo");
  Reflect.deleteProperty(window, "__raypxDesktopHost");
  vi.unstubAllGlobals();
});
function runtime(options: { waitForReady?: boolean; error?: Error } = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  let deliver:
    | ((packet: { sequence: number; event: unknown } | { ready: true }) => void)
    | undefined;
  const close = vi.fn();
  Object.defineProperty(window, "__raypxDesktopHost", { value: "mygo", configurable: true });
  window.mygo = {
    call: <T>(name: string, ...args: unknown[]): Promise<T> => {
      calls.push({ name, args });
      if (name === "Desktop.Subscribe") {
        if (options.error) return Promise.reject(options.error);
        if (!options.waitForReady) queueMicrotask(() => deliver?.({ ready: true }));
        return new Promise<T>(() => {});
      }
      return Promise.resolve({ ok: true } as T);
    },
    channel(handler) {
      deliver = handler;
      return { close };
    },
  };
  return {
    calls,
    close,
    ready: () => deliver?.({ ready: true }),
    send: (event: unknown) => deliver?.({ sequence: 7, event }),
  };
}
describe("MyGo desktop adapter", () => {
  it("preserves the renderer contract and keeps native method names inside the adapter", async () => {
    const native = runtime();
    const bridge = await createMyGoBridge(() => {});
    await bridge.request.localRequest({ method: "roots.list", params: {} });
    expect(native.calls.at(-1)).toEqual({
      name: "Desktop.Request",
      args: ["local_request", { method: "roots.list", params: {} }],
    });
    expect(Reflect.get(bridge.request, "unknown")).toBeUndefined();
    window.dispatchEvent(new Event("pagehide"));
    expect(native.close).toHaveBeenCalledOnce();
  });
  it("acknowledges consumed events even when a listener throws", async () => {
    const native = runtime();
    await createMyGoBridge(() => {
      throw new Error("listener");
    });
    expect(() => native.send({ event: "local.changed" })).toThrow("listener");
    expect(native.calls.at(-1)).toEqual({ name: "Desktop.Acknowledge", args: [7] });
  });
  it("waits until native event subscription is registered before returning the bridge", async () => {
    const native = runtime({ waitForReady: true });
    const dispatch = vi.fn();
    let connected = false;
    const bridge = createMyGoBridge(dispatch).then((value) => {
      connected = true;
      return value;
    });
    await Promise.resolve();
    expect(connected).toBe(false);
    native.ready();
    await bridge;
    expect(connected).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("rejects initialization and closes the channel when native subscription fails", async () => {
    const native = runtime({ error: new Error("Untrusted desktop view") });
    await expect(createMyGoBridge(() => {})).rejects.toThrow("Untrusted desktop view");
    expect(native.close).toHaveBeenCalledOnce();
  });
  it("requires the native preload marker", async () => {
    await expect(createMyGoBridge(() => {})).rejects.toThrow("DESKTOP_REQUIRED");
  });
});
