import type { DesktopApiRequest, DesktopApiResponse } from "../../../api";
import type { DesktopRuntime } from "../../../bridge";
import type { ControlInfo } from "@raypx/contracts/terminal";
import { connectSmoke } from "./driver";

const endpoint = process.env.RAYPX_NATIVE_SMOKE_SOCKET;
const token = process.env.RAYPX_NATIVE_SMOKE_TOKEN;
if (!endpoint || !token) throw new Error("Native smoke endpoint is missing");
const driver = await connectSmoke(endpoint, token);
/** Read on demand; `focuses` counts native focus events since smoke started. */
export type WindowState = {
  visible: boolean;
  focused: boolean;
  focuses: number;
  minimized: boolean;
  width: number;
  height: number;
  trayVisible: boolean;
  trayBounds: { width: number; height: number };
};

export const evaluate = (script: string) => driver.request("eval", { script });
/** Fire and forget: the reload discards this bridge response. */
export function reloadRenderer() {
  void evaluate("setTimeout(()=>location.reload(),0);return true").catch(() => {});
}
function invoke<T>(method: string, input: unknown) {
  return evaluate(
    `return await window.mygo.call("Desktop.Request",${JSON.stringify(method)},${JSON.stringify(input)})`,
  ) as Promise<T>;
}
export const apiOrigin = await (async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const origin = await evaluate("return window.__raypxConnection?.apiUrl");
      if (typeof origin === "string") return origin;
    } catch {
      /* Initial WebView navigation can discard an early read callback. */
    }
    await Bun.sleep(100);
  }
  throw new Error("Packaged WebView did not publish its connection preload");
})();
const runtime = () => invoke<DesktopRuntime>("get_runtime", {});
export const engine = {
  status: async () => (await runtime()).engine,
  features: async () => (await runtime()).features ?? { localTerminalApprovals: false },
  request: (method: string, params: unknown) => driver.request("engineRequest", { method, params }),
  start: () => invoke<boolean>("restart_engine", {}),
  replaceOwner: () => driver.request<boolean>("engineReplace"),
  stop: async () => {
    await driver.request("engineStop");
  },
};
export const desktopApi = {
  request: (input: DesktopApiRequest) => driver.request<DesktopApiResponse>("apiRequest", input),
};
export const control = {
  info: (accountId: string) => invoke<ControlInfo>("control_info", { accountId }),
  enable: (accountId: string, enabled: boolean) =>
    invoke<ControlInfo>("control_enable", { accountId, enabled }),
  refreshGrant: () => driver.request<boolean>("refreshGrant"),
};
export const nativeWindow = {
  state: () => driver.request<WindowState>("window"),
  close: () => driver.request<WindowState>("window", { action: "close" }),
  resize: (width: number, height: number) =>
    driver.request<WindowState>("window", { action: "resize", width, height }),
};
/** The tray menu's own actions. */
export function trayAction(action: "show" | "hide" | "pending" | "quit") {
  return driver.request("tray", { action });
}
export async function quitDesktop() {
  await trayAction("quit").catch(() => {});
  driver.close();
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
  }>("stream");
}

export async function measureNativeCors() {
  return (await import("./cors")).measureNativeCors(driver);
}
