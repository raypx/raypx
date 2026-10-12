import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const native = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  hideWindow: vi.fn(),
  defineRPC: vi.fn(),
  createView: vi.fn(),
}));
vi.mock("electrobun/view", () => ({
  Electroview: class {
    static defineRPC = native.defineRPC;
    constructor(input: unknown) {
      native.createView(input);
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  native.defineRPC.mockReturnValue({ request: native });
});
afterEach(() => vi.unstubAllGlobals());

describe("Desktop window bridge", () => {
  it("keeps browser previews usable without a native bridge", async () => {
    vi.stubGlobal("window", {});
    const { getDesktopRuntime, hideMainWindow } = await import("./desktop");
    await expect(getDesktopRuntime()).resolves.toMatchObject({
      platform: "browser",
      trayEnabled: false,
    });
    await expect(hideMainWindow()).resolves.toBe(false);
    expect(native.createView).not.toHaveBeenCalled();
  });

  it("shares one typed bridge for runtime metadata and window hiding", async () => {
    vi.stubGlobal("window", { __electrobunWebviewId: 1 });
    native.getRuntime.mockResolvedValue({
      appVersion: "0.1.0",
      platform: "darwin",
      trayEnabled: true,
    });
    native.hideWindow.mockResolvedValue(true);
    const { getDesktopRuntime, hideMainWindow } = await import("./desktop");
    await expect(getDesktopRuntime()).resolves.toMatchObject({ trayEnabled: true });
    await expect(hideMainWindow()).resolves.toBe(true);
    expect(native.getRuntime).toHaveBeenCalledWith({});
    expect(native.hideWindow).toHaveBeenCalledWith({});
    expect(native.createView).toHaveBeenCalledOnce();
  });

  it("reports unavailable native controls without claiming a working tray", async () => {
    vi.stubGlobal("window", { __electrobunWebviewId: 1 });
    native.getRuntime.mockRejectedValue(new Error("bridge unavailable"));
    native.hideWindow.mockRejectedValue(new Error("bridge unavailable"));
    const { getDesktopRuntime, hideMainWindow } = await import("./desktop");
    await expect(getDesktopRuntime()).resolves.toMatchObject({
      platform: "unknown",
      trayEnabled: false,
    });
    await expect(hideMainWindow()).resolves.toBe(false);
  });
});
