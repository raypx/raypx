/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  channels: [] as { onmessage: (input: unknown) => void }[],
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage = (_input: unknown) => {};
    constructor() {
      mocks.channels.push(this);
    }
  },
}));
beforeEach(() => {
  vi.resetModules();
  mocks.invoke.mockReset().mockResolvedValue(true);
  mocks.channels.length = 0;
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

it("registers the channel once and maps only declared bridge methods", async () => {
  const { getBridge, isDesktop } = await import("../../../../src/lib/desktop");
  expect(isDesktop()).toBe(true);
  const [left, right] = await Promise.all([getBridge(), getBridge()]);
  expect(left).toBe(right);
  await left.request.apiCancel({ id: "request-a" });
  expect(mocks.invoke.mock.calls).toEqual([
    ["subscribe_local_events", { channel: mocks.channels[0] }],
    ["api_cancel", { input: { id: "request-a" } }],
  ]);
  expect(Reflect.get(left.request, "__proto__")).toBeUndefined();
  expect(Reflect.get(left.request, "arbitrary_command")).toBeUndefined();
});

it("validates events before listeners see them and acknowledges all packets", async () => {
  const { getBridge, onLocalEvent } = await import("../../../../src/lib/desktop");
  const listener = vi.fn();
  const stop = onLocalEvent(listener);
  await getBridge();
  const channel = mocks.channels[0]!;
  channel.onmessage({ sequence: 1, event: { arbitrary: true } });
  const event = { version: 1, event: "engine.status", data: { status: "ready" } };
  channel.onmessage({ sequence: 2, event });
  expect(listener).toHaveBeenCalledExactlyOnceWith(event);
  expect(mocks.invoke).toHaveBeenCalledWith("ack_local_events", { input: { sequence: 1 } });
  expect(mocks.invoke).toHaveBeenCalledWith("ack_local_events", { input: { sequence: 2 } });
  stop();
  channel.onmessage({ sequence: 3, event });
  expect(listener).toHaveBeenCalledTimes(1);
});

it("keeps browser previews without a native transport", async () => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  const { getBridge, getDesktopRuntime, isDesktop } = await import("../../../../src/lib/desktop");
  expect(isDesktop()).toBe(false);
  expect(() => getBridge()).toThrow("DESKTOP_REQUIRED");
  await expect(getDesktopRuntime()).resolves.toMatchObject({
    platform: "browser",
    trayEnabled: false,
    engine: { status: "error" },
  });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
