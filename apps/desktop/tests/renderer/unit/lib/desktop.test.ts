/** @vitest-environment jsdom */
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { saveDesktopPreferences } from "../../../../src/lib/desktop";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("electrobun/view", () => ({
  // oxlint-disable-next-line typescript/no-extraneous-class -- Mirrors Electrobun's static Electroview API.
  Electroview: class {
    static defineRPC() {
      return { request: { savePreferences: mocks.save } };
    }
  },
}));

beforeEach(() => {
  Object.defineProperty(window, "__electrobunWebviewId", { value: 1, configurable: true });
  mocks.save.mockReset();
});
afterEach(() => {
  Reflect.deleteProperty(window, "__electrobunWebviewId");
});

describe("Desktop preference bridge", () => {
  it("serializes complete snapshots and continues after a failed write", async () => {
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
    Reflect.deleteProperty(window, "__electrobunWebviewId");
    await expect(saveDesktopPreferences({ theme: "dark", locale: "zh" })).resolves.toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
