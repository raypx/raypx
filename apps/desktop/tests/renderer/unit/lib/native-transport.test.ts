/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
const transport = vi.hoisted(() => ({
  dispatch: undefined as ((event: unknown) => void) | undefined,
  cancel: vi.fn(),
}));
vi.mock("../../../../src/lib/mygo", () => ({
  createMyGoBridge: async (dispatch: (event: unknown) => void) => {
    transport.dispatch = dispatch;
    return { request: { apiCancel: transport.cancel } };
  },
}));
beforeEach(() => {
  vi.resetModules();
  transport.cancel.mockReset();
  Object.defineProperty(window, "__raypxDesktopHost", { value: "mygo", configurable: true });
});
afterEach(() => Reflect.deleteProperty(window, "__raypxDesktopHost"));
it("reuses the bridge and validates events before notifying product listeners", async () => {
  const { getBridge, onLocalEvent } = await import("../../../../src/lib/desktop");
  const [left, right] = await Promise.all([getBridge(), getBridge()]);
  expect(left).toBe(right);
  await left.request.apiCancel({ id: "request-a" });
  expect(transport.cancel).toHaveBeenCalledWith({ id: "request-a" });
  const listener = vi.fn();
  const off = onLocalEvent(listener);
  transport.dispatch?.({ arbitrary: true });
  const event = { version: 1, event: "engine.status", data: { status: "ready" } };
  transport.dispatch?.(event);
  expect(listener).toHaveBeenCalledExactlyOnceWith(event);
  off();
  transport.dispatch?.(event);
  expect(listener).toHaveBeenCalledTimes(1);
});
it("requires the native preload for transport but keeps browser previews available", async () => {
  Reflect.deleteProperty(window, "__raypxDesktopHost");
  const { getBridge, getDesktopRuntime, isDesktop } = await import("../../../../src/lib/desktop");
  expect(isDesktop()).toBe(false);
  expect(() => getBridge()).toThrow("DESKTOP_REQUIRED");
  await expect(getDesktopRuntime()).resolves.toMatchObject({
    platform: "browser",
    trayEnabled: false,
  });
});
