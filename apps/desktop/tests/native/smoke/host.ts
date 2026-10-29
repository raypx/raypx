import type { DesktopApiRequest, DesktopApiResponse } from "../../../api";
import type { DesktopRuntime } from "../../../bridge";
import type { ControlInfo } from "@raypx/contracts/terminal";
import { connectSmoke } from "./driver";

const endpoint = process.env.RAYPX_NATIVE_SMOKE_SOCKET;
const token = process.env.RAYPX_NATIVE_SMOKE_TOKEN;
if (!endpoint || !token) throw new Error("Native smoke endpoint is missing");
const driver = await connectSmoke(endpoint, token);
type WindowState = {
  visible: boolean;
  focused: boolean;
  width: number;
  height: number;
  trayVisible: boolean;
  trayBounds: { width: number; height: number };
};
let runtime = await driver.request<DesktopRuntime>("runtime");
let windowState = await driver.request<WindowState>("windowState");
const focusListeners = new Set<() => void>();
let stopped = false;
let refreshing = false;
async function refresh() {
  if (stopped || refreshing) return;
  refreshing = true;
  try {
    runtime = await driver.request<DesktopRuntime>("runtime");
    const next = await driver.request<WindowState>("windowState");
    if (next.focused && !windowState.focused) for (const listener of focusListeners) listener();
    windowState = next;
  } catch {
    stopped = true;
  } finally {
    refreshing = false;
  }
}
const polling = setInterval(() => {
  void refresh();
}, 100);
polling.unref();
const action = (method: string, input: unknown = {}) => {
  void driver
    .request(method, input)
    .then(() => refresh())
    .catch(() => {});
};
export const view = {
  evaluate: (script: string) => driver.request("eval", { script }),
  reload: () => {
    action("eval", { script: "setTimeout(()=>location.reload(),0);return true" });
  },
};
export const apiOrigin = await (async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const origin = await view.evaluate("return window.__raypxConnection?.apiUrl");
      if (typeof origin === "string") return origin;
    } catch {
      /* Initial WebView navigation can discard an early read callback. */
    }
    await Bun.sleep(100);
  }
  throw new Error("Packaged WebView did not publish its connection preload");
})();
export const engine = {
  get status() {
    return runtime.engine;
  },
  get features() {
    return runtime.features ?? { localTerminalApprovals: false };
  },
  request: (method: string, params: unknown) => driver.request("engineRequest", { method, params }),
  start: () => invoke<boolean>("restart_engine", {}),
  replaceOwner: () => driver.request<boolean>("engineReplace"),
  stop: async () => {
    await driver.request("engineStop");
  },
};
function invoke<T>(method: string, input: unknown) {
  return view.evaluate(
    `return await window.mygo.call("Desktop.Request",${JSON.stringify(method)},${JSON.stringify(input)})`,
  ) as Promise<T>;
}
export const desktopApi = {
  request: (input: DesktopApiRequest) => driver.request<DesktopApiResponse>("apiRequest", input),
};
export const control = {
  info: (accountId: string) => invoke<ControlInfo>("control_info", { accountId }),
  enable: (accountId: string, enabled: boolean) =>
    invoke<ControlInfo>("control_enable", { accountId, enabled }),
  refreshGrant: () => driver.request<boolean>("refreshGrant"),
};
async function visibilityAction(method: "show" | "hide") {
  await driver.request(method);
  await refresh();
}

export const mainWindow = {
  on: (_name: string, listener: () => void) => {
    focusListeners.add(listener);
  },
  requestClose: () => {
    action("close");
  },
  isVisible: () => windowState.visible,
  hide: () => visibilityAction("hide"),
  getSize: () => ({ width: windowState.width, height: windowState.height }),
  setSize: (width: number, height: number) => {
    action("resize", { width, height });
  },
};
export const tray = {
  get visible() {
    return windowState.trayVisible;
  },
  getBounds: () => windowState.trayBounds,
};
export const windowActions = {
  show: () => visibilityAction("show"),
  hide: mainWindow.hide,
};
export function handleTrayAction(actionName: unknown) {
  action("tray", { action: actionName });
}
let cleanupAttempted = false;
export async function cleanupSessionKeys(force = false) {
  if (cleanupAttempted || (!force && process.env.RAYPX_NATIVE_SMOKE_CLEANUP_SESSIONS !== "true"))
    return;
  cleanupAttempted = true;
  await driver.request("cleanupSessionKeys");
}
export async function quitDesktop(code = 0) {
  stopped = true;
  clearInterval(polling);
  try {
    await cleanupSessionKeys(code !== 0);
  } finally {
    await driver.request("quit", { code }).catch(() => {});
    driver.close();
  }
}

export function measureNativeStream() {
  return driver.request<{
    renderer: { count: number; bytes: number; ordered: boolean; intact: boolean };
    packets: number;
    bytes: number;
    elapsedMs: number;
    bytesPerSecond: number;
    outstandingBytes: number;
    maxOutstandingBytes: number;
    creditBytes: number;
  }>("stream", { durationMs: 2000, bytesPerSecond: 10 * 1024 * 1024 });
}

export async function measureNativeCors() {
  return (await import("./cors")).measureNativeCors(driver);
}
