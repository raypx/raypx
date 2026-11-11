import type { DesktopApiRequest, DesktopApiResponse } from "../../../api.js";
import type { DesktopRuntime } from "../../../bridge.js";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { smokeOwnerRequest, stopSmokeOwner } from "./owner.js";
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
  features: async () => (await runtime()).features ?? { localTerminalApprovals: false },
  request: (method: string, params: unknown) => smokeOwnerRequest(directory, method, params),
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
export function trayAction(action: "show" | "hide" | "pending" | "quit") {
  return driver.request("tray", { action });
}
export async function quitDesktop() {
  await trayAction("quit").catch(() => {});
  driver.close();
}

type Throughput = { count: number; bytes: number; intact: boolean; ordered: boolean };

async function evaluateThroughput(step: string, script: string): Promise<Throughput> {
  const result = (await evaluate(`
    try {
      return {value: await (async () => { ${script} })()};
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return {code: /^[A-Z][A-Z0-9_]{1,63}$/.test(message) ? message : "UNKNOWN_ERROR"};
    }
  `)) as { value: Throughput } | { code: string };
  if ("code" in result) throw new Error(`Daemon throughput ${step} failed: ${result.code}`);
  return result.value;
}

export async function measureNativeStream() {
  const project = join(directory, "channel-throughput");
  await mkdir(project, { recursive: true });
  const text = "x".repeat(1024 * 1024);
  await writeFile(join(project, "payload.txt"), text);
  const root = (await smokeOwnerRequest(directory, "roots.register", { path: project })) as {
    id: string;
  };
  const started = performance.now();
  const renderer = await evaluateThroughput(
    "file reads",
    `let count=0,bytes=0,intact=true;for(let index=0;index<20;index++){const result=await window.__raypxSmokeRequest('local_request',{method:'files.read',params:{rootId:${JSON.stringify(root.id)},path:'payload.txt'}});count++;bytes+=result.text.length;intact&&=result.text==='x'.repeat(1024*1024);}return {count,bytes,intact,ordered:count===20}`,
  );
  const elapsedMs = performance.now() - started;
  // The smoke runner is a real Bun executable on both platforms. The Windows
  // runtime.info Bun shim is a batch file intended for invocation by a shell.
  const events = await evaluateThroughput(
    "tool events",
    `
    const ids = Array.from({length: 8}, () => crypto.randomUUID());
    let count = 0, bytes = 0, intact = true, ordered = true, previous;
    const observe = ({detail}) => {
      if (previous !== undefined && detail.sequence !== previous + 1) ordered = false;
      previous = detail.sequence;
      const {event} = detail;
      if (event.event !== 'tool.finished' || !ids.includes(event.data.id)) return;
      ordered &&= event.data.id === ids[count];
      const expected = String(count) + ':' + 'x'.repeat(256 * 1024 - 2);
      intact &&= event.data.output === expected && event.data.exitCode === 0;
      bytes += event.data.output.length;
      count++;
    };
    window.addEventListener('raypx-smoke-local-event', observe);
    try {
      for (let index = 0; index < ids.length; index++) {
        await window.__raypxSmokeRequest('local_request', {method: 'tools.run', params: {
          id: ids[index], executable: ${JSON.stringify(process.execPath)}, cwd: ${JSON.stringify(project)},
          args: ['-e', "process.stdout.write(" + JSON.stringify(String(index) + ':') + "+'x'.repeat(256*1024-2))"], timeoutMs: 10000,
        }});
      }
      const deadline = Date.now() + 5000;
      while (count < ids.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      return {count, bytes, intact, ordered};
    } finally {
      window.removeEventListener('raypx-smoke-local-event', observe);
    }
  `,
  );
  await smokeOwnerRequest(directory, "roots.remove", { id: root.id });
  return {
    renderer,
    events,
    packets: 20,
    bytes: 20 * 1024 * 1024,
    elapsedMs,
    bytesPerSecond: (20 * 1024 * 1024) / (elapsedMs / 1000),
  };
}

export async function measureNativeCors() {
  return (await import("./cors.js")).measureNativeCors(driver);
}
