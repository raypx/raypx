/** @vitest-environment happy-dom */
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = (_input: unknown) => {};
  },
  invoke: (method: string, payload: { input?: unknown }) =>
    method === "save_preferences" ? mocks.save(payload.input) : Promise.resolve(true),
}));

beforeEach(() => {
  vi.resetModules();
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  mocks.save.mockReset();
});
afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("Desktop preference bridge", () => {
  it("serializes complete snapshots and continues after a failed write", async () => {
    const { saveDesktopPreferences } = await import("../../../../src/lib/desktop");
    let reject!: (error: Error) => void;
    const pending = new Promise<boolean>((_resolve, fail) => {
      reject = fail;
    });
    mocks.save.mockReturnValueOnce(pending).mockResolvedValueOnce(true);
    const first = saveDesktopPreferences({ theme: "dark", locale: "zh" });
    const last = saveDesktopPreferences({ theme: "light", locale: "en" });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    reject(new Error("unavailable"));
    await expect(first).rejects.toThrow("unavailable");
    await expect(last).resolves.toBe(true);
    expect(mocks.save.mock.calls).toEqual([
      [{ theme: "dark", locale: "zh" }],
      [{ theme: "light", locale: "en" }],
    ]);
  });

  it("keeps browser preview independent of native persistence", async () => {
    const { saveDesktopPreferences } = await import("../../../../src/lib/desktop");
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    await expect(saveDesktopPreferences({ theme: "dark", locale: "zh" })).resolves.toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
