/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { desktopAnalyticsStore } from "../../../../../src/features/analytics/store";
const mocks = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue(true), read: vi.fn() }));
vi.mock("../../../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  getBridge: async () => ({
    request: { saveAnalyticsPreferences: mocks.save, getAnalyticsPreferences: mocks.read },
  }),
}));
afterEach(() => {
  Reflect.deleteProperty(window, "__raypxDevicePreferences");
  localStorage.clear();
  mocks.read.mockReset();
  mocks.save.mockReset().mockResolvedValue(true);
});
it("ignores stale browser consent when the authoritative native snapshot is unavailable", async () => {
  mocks.read.mockRejectedValueOnce(new Error("Native unavailable"));
  localStorage.setItem("raypx_analytics", JSON.stringify({ usage: true, errors: true }));
  Reflect.set(window, "__raypxDevicePreferences", {
    status: "error",
    preferences: { theme: "dark", locale: "zh" },
  });
  expect(await desktopAnalyticsStore().read()).toEqual({ usage: false, errors: false });
});
it("reads current Native consent after saving and reloading, ignoring the startup preload", async () => {
  Reflect.set(window, "__raypxDevicePreferences", {
    status: "valid",
    preferences: { theme: "dark", locale: "zh", analytics: { usage: true, errors: false } },
  });
  let current = { usage: true, errors: false };
  mocks.read.mockImplementation(async () => current);
  mocks.save.mockImplementation(async (value) => {
    current = value;
    return true;
  });
  const store = desktopAnalyticsStore();
  expect(await store.read()).toEqual({ usage: true, errors: false });
  await store.write({ usage: false, errors: true });
  expect(mocks.save).toHaveBeenCalledWith({ usage: false, errors: true });
  expect(await desktopAnalyticsStore().read()).toEqual({ usage: false, errors: true });
  expect(mocks.read).toHaveBeenLastCalledWith({}, { maxRequestTime: 5000 });
});
it.each([null, { usage: true }, { usage: true, errors: "true" }])(
  "fails closed on invalid Native consent: %j",
  async (value) => {
    mocks.read.mockResolvedValueOnce(value);
    expect(await desktopAnalyticsStore().read()).toEqual({ usage: false, errors: false });
  },
);
it("fails closed when the bounded RPC read times out", async () => {
  mocks.read.mockRejectedValueOnce(new Error("RPC request timed out"));
  expect(await desktopAnalyticsStore().read()).toEqual({ usage: false, errors: false });
  expect(mocks.read).toHaveBeenCalledWith({}, { maxRequestTime: 5000 });
});
