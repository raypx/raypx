import type { DesktopRpc, DesktopRuntime } from "../../native/rpc";

export type { DesktopRuntime } from "../../native/rpc";

const browserRuntime: DesktopRuntime = {
  appVersion: "0.1.0",
  platform: "browser",
  trayEnabled: false,
};

function isNativeRuntime(): boolean {
  return typeof window !== "undefined" && "__electrobunWebviewId" in window;
}

let nativeBridge: ReturnType<typeof createNativeBridge> | undefined;

async function createNativeBridge() {
  const { Electroview } = await import("electrobun/view");
  const rpc = Electroview.defineRPC<DesktopRpc>({
    maxRequestTime: 5000,
    handlers: { requests: {}, messages: {} },
  });
  new Electroview({ rpc });
  return rpc;
}

function getNativeBridge() {
  nativeBridge ??= createNativeBridge();
  return nativeBridge;
}

export async function getDesktopRuntime(): Promise<DesktopRuntime> {
  if (!isNativeRuntime()) return browserRuntime;
  try {
    return await (await getNativeBridge()).request.getRuntime({});
  } catch {
    return { ...browserRuntime, platform: "unknown" };
  }
}

export async function hideMainWindow(): Promise<boolean> {
  if (!isNativeRuntime()) return false;
  try {
    return await (await getNativeBridge()).request.hideWindow({});
  } catch {
    return false;
  }
}
