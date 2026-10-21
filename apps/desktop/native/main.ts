import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LocalEvent, RootGrant } from "@raypx/contracts/local";
import { messages } from "@raypx/i18n/messages";
import { RemoteControl } from "./control";
import { LocalEngine } from "./engine";
import { createPreferenceStore } from "./preferences";
import { BuildConfig } from "electrobun/main/build-config";
import { BrowserView } from "electrobun/main/browser-view";
import { BrowserWindow } from "electrobun/main/browser-window";
import ElectrobunEvents from "electrobun/main/events";
import { Tray } from "electrobun/main/tray";
import { Updater } from "electrobun/main/updater";
import * as Utils from "electrobun/main/utils";
import manifest from "../package.json";
import type { DesktopRpc } from "./rpc";
import { wireWindow } from "./window";

const build = BuildConfig.getSync();
if (process.platform === "win32") {
  const executableDirectory = dirname(process.execPath);
  const required = ["libcef.dll", "icudtl.dat"];
  const cefAvailable = required.every((file) => {
    try {
      return statSync(join(executableDirectory, file)).isFile();
    } catch {
      return false;
    }
  });
  if (build.defaultRenderer !== "cef" || !build.availableRenderers.includes("cef") || !cefAvailable)
    throw new Error("Windows Desktop requires packaged CEF with browser security enabled.");
}

const channel = await Updater.localInfo.channel();
let url = "views://main/index.html";
if (channel === "dev" && process.env.RAYPX_NATIVE_SMOKE !== "1") {
  try {
    await fetch("http://localhost:1420", { method: "HEAD", signal: AbortSignal.timeout(1000) });
    url = "http://localhost:1420";
  } catch {
    // Native dev also works with the last built SPA when Vite is not running.
  }
}
const smokeViewUrl = process.env.RAYPX_NATIVE_SMOKE_VIEW_URL;
if (process.env.RAYPX_NATIVE_SMOKE === "1" && smokeViewUrl) {
  const testView = new URL(smokeViewUrl);
  if (
    channel !== "dev" ||
    testView.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(testView.hostname)
  )
    throw new Error("Native smoke views must use a loopback HTTP development server.");
  url = testView.href;
}

// Electrobun 2.0.2 does not forward partition from BrowserWindow to its initial
// BrowserView. Replace the empty view before loading the app so cookies and
// preferences use one persistent native partition on every launch.
export const mainWindow = new BrowserWindow({
  title: "Raypx",
  url: null,
  hidden: true,
  frame: { width: 1120, height: 720 },
});
mainWindow.webview.remove();

export const tray = new Tray({
  image: "views://assets/tray-icon.png",
  template: false,
  width: 20,
  height: 20,
});

const executable = process.platform === "win32" ? "raypx.exe" : "raypx";
// Electrobun runs from its executable directory; copy destinations are in Resources.
const cliBinary = resolve(dirname(process.execPath), "../Resources/app/bin", executable);
const engineArgs =
  process.env.RAYPX_NATIVE_SMOKE === "1"
    ? [
        "--profile",
        "native-smoke",
        "--data-dir",
        resolve(process.env.RAYPX_NATIVE_SMOKE_DATA_DIR ?? ".hutch/native-smoke-data"),
      ]
    : [];
const preferences = createPreferenceStore(
  process.env.RAYPX_NATIVE_SMOKE === "1"
    ? resolve(process.env.RAYPX_NATIVE_SMOKE_DATA_DIR ?? ".hutch/native-smoke-data")
    : Utils.paths.userData,
);
let emitLocalEvent: (event: LocalEvent) => void | Promise<void> = () => {};
function notifyPending() {
  Utils.showNotification({
    title: "Raypx",
    body: messages[
      preferences.read().locale === "zh" ||
      (preferences.read().locale === "system" &&
        Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh"))
        ? "zh"
        : "en"
    ].tasks.notification,
  });
}
export const engine = new LocalEngine(
  cliBinary,
  manifest.version,
  (event) => {
    if (event.event === "agent.changed") {
      void control.wake();
      // Local approvals never reach the relay, so the engine flags them directly.
      if (typeof event.data.pendingRequest === "string") notifyPending();
    }
    return emitLocalEvent(event);
  },
  engineArgs,
);
const control = new RemoteControl(
  process.env.RAYPX_NATIVE_SMOKE === "1"
    ? resolve(process.env.RAYPX_NATIVE_SMOKE_DATA_DIR ?? ".hutch/native-smoke-data")
    : Utils.paths.userData,
  engine,
  notifyPending,
  () => {
    void emitLocalEvent({ version: 1, event: "sync.grantRequired", data: {} });
  },
);
const rpc = BrowserView.defineRPC<DesktopRpc>({
  maxRequestTime: 5000,
  handlers: {
    requests: {
      controlInfo: ({ accountId }) => control.info(accountId),
      controlEnable: ({ accountId, enabled }) => control.enable(accountId, enabled),
      controlRevoked: ({ accountId }) => control.revoked(accountId),
      controlAttach: ({ accountId, apiUrl, grant }) => control.attach(accountId, apiUrl, grant),
      controlDetach: async () => {
        await control.detach();
        return true;
      },
      getRuntime: () => ({
        appVersion: manifest.version,
        platform: process.platform,
        trayEnabled: tray.visible,
        engine: engine.status,
      }),
      localRequest: ({ method, params }) => {
        if (method === "roots.register")
          throw new Error("Use the native directory picker to authorize a directory");
        return engine.request(method, params);
      },
      pickDirectory: async () => {
        const paths = await Utils.openFileDialog({
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });
        const path = paths[0];
        return path ? ((await engine.request("roots.register", { path })) as RootGrant) : null;
      },
      restartEngine: () => engine.start(),
      savePreferences: (input) => preferences.save(input),
      hideWindow: () => {
        if (!tray.visible) return false;
        mainWindow.hide();
        return !mainWindow.isVisible();
      },
    },
    messages: {},
  },
});
export const view = new BrowserView({
  windowId: mainWindow.id,
  url,
  preload: preferences.preload(),
  partition:
    process.env.RAYPX_NATIVE_SMOKE === "1" ? "persist:raypx-native-smoke" : "persist:raypx",
  frame: { x: 0, y: 0, width: 1120, height: 720 },
  navigationRules: JSON.stringify([
    "^*",
    "views://main/*",
    "views://close/index.html",
    ...(url.startsWith("http://") ? [`${new URL(url).origin}/*`] : []),
  ]),
  rpc,
});
mainWindow.webviewId = view.id;
// The SDK message proxy discards its transport promise. Use the public queued
// transport to apply backpressure instead of accumulating unbounded PTY packets.
emitLocalEvent = (event) =>
  view.queueHostMessageToWebview({ type: "message", id: "localEvent", payload: event });
void engine.start();
export async function quitDesktop(code = 0) {
  const approval = Utils.requestQuitApproval();
  if (!approval) return;
  try {
    await control.detach();
    await engine.stop();
    // Let WebKit complete a normal page unload before graceful native shutdown.
    // A missing/failed view must never leave a reserved quit approval hanging.
    await new Promise<void>((done) => {
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        done();
      };
      const timeout = setTimeout(finish, 2000);
      try {
        mainWindow.hide();
        view.on("dom-ready", (event) => {
          if (!event || typeof event !== "object" || !("data" in event)) return;
          const data = event.data;
          if (
            data &&
            typeof data === "object" &&
            "detail" in data &&
            data.detail === "views://close/index.html"
          )
            finish();
        });
        view.loadURL("views://close/index.html");
      } catch {
        finish();
      }
    });
  } finally {
    Utils.quitAfterApproval(approval, code);
  }
}
process.once("SIGTERM", () => {
  void quitDesktop();
});
process.once("SIGINT", () => {
  void quitDesktop();
});
export const windowActions = wireWindow(
  mainWindow,
  () => tray.visible,
  () => {
    void quitDesktop();
  },
);
ElectrobunEvents.on("reopen", () => windowActions.show());
tray.setMenu([
  { type: "normal", label: "Show Raypx", action: "show" },
  { type: "normal", label: "Hide window", action: "hide" },
  { type: "separator" },
  { type: "normal", label: "Quit Raypx", action: "quit" },
]);
export function handleTrayAction(action: unknown) {
  if (action === "show") windowActions.show();
  if (action === "hide") windowActions.hide();
  if (action === "quit") void quitDesktop();
}
tray.on("tray-clicked", (event) => {
  if (!event || typeof event !== "object" || !("data" in event)) return;
  const data = event.data;
  if (!data || typeof data !== "object" || !("action" in data)) return;
  handleTrayAction(data.action);
});
mainWindow.show();
