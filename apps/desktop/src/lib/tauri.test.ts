import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  deliver: undefined as undefined | ((packet: unknown) => void),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  Channel: function (handler: (packet: unknown) => void) {
    native.deliver = handler;
  },
}));
import { createTauriBridge } from "./tauri.ts";
beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
  native.invoke.mockReset();
  native.deliver = undefined;
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.unstubAllGlobals();
});
function runtime(wait = false) {
  Object.defineProperty(window, "__raypxDesktopHost", { value: "tauri" });
  native.invoke.mockImplementation(async (name: string) => {
    if (name === "desktop_subscribe") {
      if (!wait) queueMicrotask(() => native.deliver?.({ ready: true, subscription: 3 }));
      return 3;
    }
    return { ok: true };
  });
}
describe("Tauri desktop bridge", () => {
  it("preserves the renderer contract and unsubscribes when its page closes", async () => {
    runtime();
    const bridge = await createTauriBridge(() => {});
    await bridge.request.localRequest({ method: "roots.list", params: {} });
    expect(native.invoke).toHaveBeenLastCalledWith("desktop_request", {
      method: "local_request",
      input: { method: "roots.list", params: {} },
    });
    expect(Reflect.get(bridge.request, "unknown")).toBeUndefined();
    window.dispatchEvent(new Event("pagehide"));
    expect(native.invoke).toHaveBeenLastCalledWith("desktop_unsubscribe", { subscription: 3 });
  });
  it("acknowledges delivered events when listeners throw and ignores stale subscriptions", async () => {
    runtime();
    const dispatch = vi.fn(() => {
      throw new Error("listener");
    });
    await createTauriBridge(dispatch);
    native.deliver?.({ subscription: 2, sequence: 8, event: {} });
    expect(dispatch).not.toHaveBeenCalled();
    expect(() =>
      native.deliver?.({ subscription: 3, sequence: 9, event: { event: "local.changed" } }),
    ).toThrow("listener");
    expect(native.invoke).toHaveBeenLastCalledWith("desktop_acknowledge", {
      subscription: 3,
      sequence: 9,
    });
  });
  it("waits for subscription registration and rejects a denied subscription", async () => {
    runtime(true);
    let connected = false;
    const pending = createTauriBridge(() => {}).then(() => {
      connected = true;
    });
    await Promise.resolve();
    expect(connected).toBe(false);
    native.deliver?.({ ready: true, subscription: 3 });
    await pending;
    expect(connected).toBe(true);
    native.invoke.mockRejectedValueOnce(new Error("UNTRUSTED_DESKTOP_VIEW"));
    await expect(createTauriBridge(() => {})).rejects.toThrow("UNTRUSTED_DESKTOP_VIEW");
  });
  it("requires the native preload marker", async () => {
    await expect(createTauriBridge(() => {})).rejects.toThrow("DESKTOP_REQUIRED");
  });
});
