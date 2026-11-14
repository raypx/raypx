import type { DesktopApiRequest, DesktopApiResponse } from "../../../api.js";
import type { DesktopRuntime } from "../../../bridge.js";
import { stopSmokeOwner } from "./owner.js";
import { connectSmoke } from "./driver.js";

const endpoint = process.env.RAYPX_NATIVE_SMOKE_SOCKET;
const token = process.env.RAYPX_NATIVE_SMOKE_TOKEN;
if (!endpoint || !token) throw new Error("Native smoke endpoint is missing");
const driver = await connectSmoke(endpoint, token);
const selectedDirectory = process.env.RAYPX_NATIVE_SMOKE_DATA_DIR;
if (!selectedDirectory) throw new Error("Isolated smoke directory missing");
const directory: string = selectedDirectory;
/**
 * Read on demand. `focuses` counts native focus events; `activations` counts the
 * application becoming active (macOS) or its window taking the foreground (Windows).
 */
export type WindowState = {
  visible: boolean;
  focused: boolean;
  focuses: number;
  activations: number;
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
    `return await window.__raypxSmokeRequest(${JSON.stringify(method)},${JSON.stringify(input)})`,
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
  rendererRequest: (method: string, params: unknown) => invoke("local_request", { method, params }),
  start: () => invoke<boolean>("restart_engine", {}),
  replaceOwner: () => invoke<boolean>("restart_engine", { replaceOwner: true }),
  stop: async () => {
    await stopSmokeOwner(directory);
  },
};
export const desktopApi = {
  request: (input: DesktopApiRequest) => invoke<DesktopApiResponse>("api_fetch", input),
};
export const nativeWindow = {
  state: () => driver.request<WindowState>("window"),
  close: () => driver.request<WindowState>("window", { action: "close" }),
  resize: (width: number, height: number) =>
    driver.request<WindowState>("window", { action: "resize", width, height }),
};
/** The tray menu's own actions. */
export function trayAction(action: "show" | "hide" | "quit") {
  return driver.request("tray", { action });
}
export async function quitDesktop() {
  await trayAction("quit").catch(() => {});
  driver.close();
}
