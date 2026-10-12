import { statSync } from "node:fs";
import { dirname, join } from "node:path";
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
if (
  channel === "dev" &&
  !(process.env.VOIDMIX_NATIVE_SMOKE === "1" && process.env.VOIDMIX_NATIVE_SMOKE_PHASE === "shell")
) {
  try {
    await fetch("http://localhost:1420", { method: "HEAD", signal: AbortSignal.timeout(1000) });
    url = "http://localhost:1420";
  } catch {
    // Native dev also works with the last built SPA when Vite is not running.
  }
}
const smokeViewUrl = process.env.VOIDMIX_NATIVE_SMOKE_VIEW_URL;
if (process.env.VOIDMIX_NATIVE_SMOKE === "1" && smokeViewUrl) {
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
  title: "VoidMix",
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

const rpc = BrowserView.defineRPC<DesktopRpc>({
  maxRequestTime: 5000,
  handlers: {
    requests: {
      getRuntime: () => ({
        appVersion: manifest.version,
        platform: process.platform,
        trayEnabled: tray.visible,
      }),
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
  partition:
    process.env.VOIDMIX_NATIVE_SMOKE === "1" ? "persist:voidmix-native-smoke" : "persist:voidmix",
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
export async function quitDesktop(code = 0) {
  const approval = Utils.requestQuitApproval();
  if (!approval) return;
  try {
    // Let WebKit complete a normal page unload before graceful native shutdown.
    // A missing/failed view must never leave a reserved quit approval hanging.
    await new Promise<void>((resolve) => {
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        clearTimeout(timeout);
        resolve();
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
export const windowActions = wireWindow(
  mainWindow,
  () => tray.visible,
  () => {
    void quitDesktop();
  },
);
ElectrobunEvents.on("reopen", () => windowActions.show());
tray.setMenu([
  { type: "normal", label: "Show VoidMix", action: "show" },
  { type: "normal", label: "Hide window", action: "hide" },
  { type: "separator" },
  { type: "normal", label: "Quit VoidMix", action: "quit" },
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
