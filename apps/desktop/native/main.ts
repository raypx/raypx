import { statSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseAnalyticsConsent } from "@raypx/analytics";
import { dirname, join, resolve } from "node:path";
import type { LocalEvent, RootGrant } from "@raypx/contracts/local";
import { messages } from "@raypx/i18n/messages";
import { RemoteControl } from "./control";
import { DaemonControlProxy } from "./daemon-control";
import { createApiClient } from "@raypx/client";
import { LocalEngine } from "./engine";
import { createPreferenceStore } from "./preferences";
import { BuildConfig } from "electrobun/main/build-config";
import { BrowserView } from "electrobun/main/browser-view";
import { BrowserWindow } from "electrobun/main/browser-window";
import ElectrobunEvents from "electrobun/main/events";
import { Tray } from "electrobun/main/tray";
import { Updater } from "electrobun/main/updater";
import * as Utils from "electrobun/main/utils";
import { Session } from "electrobun/main/native";
import { createDesktopApi, parseApiOrigin } from "./api";
import { loadDesktopConfig, scopeLocalAccount } from "./config";
import { createEncryptedCookies } from "./cookies";
import { acquireDesktopInstance, desktopInstancePath } from "./instance";
import { externalUrl } from "./external";
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

const smokeDirectory =
  process.env.RAYPX_NATIVE_SMOKE === "1"
    ? resolve(process.env.RAYPX_NATIVE_SMOKE_DATA_DIR ?? ".hutch/native-smoke-data")
    : undefined;
const releaseInstance = acquireDesktopInstance(smokeDirectory ?? Utils.paths.userData);
if (!releaseInstance) {
  await Utils.showMessageBox({
    type: "info",
    title: "Raypx",
    message: "Raypx is already running / Raypx 已在运行",
    detail: desktopInstancePath(smokeDirectory ?? Utils.paths.userData),
    buttons: ["OK / 确定"],
  });
  Utils.quit();
  throw new Error("Desktop instance already running");
}
process.once("exit", releaseInstance);
export const connectionConfig = await (async () => {
  try {
    return loadDesktopConfig(smokeDirectory ? join(smokeDirectory, "config") : undefined);
  } catch (error) {
    if (smokeDirectory) throw error;
    const chinese = Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh");
    await Utils.showMessageBox({
      type: "error",
      title: "Raypx",
      message: chinese
        ? "无法读取连接配置，请修正后重新启动。"
        : "Fix the connection configuration and restart Raypx.",
      detail: error instanceof Error ? error.message : "Unable to load config.toml",
      buttons: [chinese ? "退出" : "Quit"],
    });
    Utils.quit();
    throw error;
  }
})();
export const apiOrigin = connectionConfig.connection.apiUrl;

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
  width: 16,
  height: 16,
});

const executable = process.platform === "win32" ? "raypx.exe" : "raypx";
// Electrobun runs from its executable directory; copy destinations are in Resources.
const cliBinary = resolve(dirname(process.execPath), "../Resources/app/bin", executable);
const engineArgs = smokeDirectory
  ? ["--profile", "native-smoke", "--data-dir", smokeDirectory]
  : [];
const daemonEngine = process.platform === "darwin";
const preferences = createPreferenceStore(smokeDirectory ?? Utils.paths.userData);
const partition =
  connectionConfig.partition +
  (smokeDirectory
    ? `-smoke-${createHash("sha256").update(smokeDirectory).digest("hex").slice(0, 16)}`
    : "");
const serverDirectory = join(
  smokeDirectory ?? Utils.paths.userData,
  "servers",
  connectionConfig.scope,
);
const cookies = await (async () => {
  if (process.platform !== "win32") return Session.fromPartition(partition).cookies;
  try {
    return await createEncryptedCookies(serverDirectory, apiOrigin, Bun.secrets, (recovery) => {
      if (!smokeDirectory)
        void Utils.showMessageBox({
          type: "warning",
          title: "Raypx",
          message:
            recovery.kind === "reset"
              ? "Session storage was reset. Sign in again. / 登录存储已重置，请重新登录。"
              : "Secure storage is unavailable. This login will not survive a restart. / 安全存储不可用，本次登录不会保存。",
          detail: recovery.path,
          buttons: ["OK / 确定"],
        });
    });
  } catch {
    if (!smokeDirectory) {
      await Utils.showMessageBox({
        type: "error",
        title: "Raypx",
        message: "Unable to open Windows secure session storage / 无法读取 Windows 安全登录存储",
        buttons: ["Quit / 退出"],
      });
      Utils.quit();
    }
    throw new Error("Windows secure session storage unavailable");
  }
})();
export const desktopApi = createDesktopApi(apiOrigin, cookies);
const nativeApiClient = createApiClient({ baseUrl: apiOrigin, fetch: desktopApi.fetch });
let emitLocalEvent: (event: LocalEvent) => void | Promise<void> = () => {};
let pendingScope: "local" | "remote" | undefined;
function notifyPending(scope: "local" | "remote" = "remote") {
  pendingScope = scope;
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
    if (event.event === "agent.changed" || event.event === "observed.changed") {
      if (event.data.local !== true) void control.wake();
      // Local approvals never reach the relay, so the engine flags them directly.
      if (typeof event.data.pendingRequest === "string")
        notifyPending(
          event.event === "observed.changed" || event.data.local === true ? "local" : "remote",
        );
    }
    return emitLocalEvent(event);
  },
  engineArgs,
  daemonEngine,
);
export const control = daemonEngine
  ? new DaemonControlProxy(engine, apiOrigin, nativeApiClient)
  : new RemoteControl(
      serverDirectory,
      engine,
      () => notifyPending("remote"),
      () => {
        void emitLocalEvent({ version: 1, event: "sync.grantRequired", data: {} });
      },
      {
        renewGrant: async (accountId, binding) => {
          const account = await nativeApiClient.account.get({});
          if (account.id !== accountId)
            throw Object.assign(new Error("AUTH_REQUIRED"), { code: "UNAUTHORIZED" });
          return nativeApiClient.devices.refreshGrant(binding);
        },
      },
    );
const rpc = BrowserView.defineRPC<DesktopRpc>({
  maxRequestTime: 30_000,
  handlers: {
    requests: {
      openExternal: (input) => {
        const safe = externalUrl(input.url);
        return safe ? Utils.openExternal(safe) : false;
      },
      apiCancel: ({ id }) => desktopApi.cancel(id),
      apiFetch: (input) => desktopApi.request(input),
      controlInfo: ({ accountId }) => control.info(accountId),
      controlSession: ({ accountId }) =>
        control instanceof DaemonControlProxy ? control.session(accountId) : true,
      controlEnable: ({ accountId, enabled }) => control.enable(accountId, enabled),
      controlRevoked: ({ accountId }) => control.revoked(accountId),
      controlAttach: ({ accountId, apiUrl, grant }) => {
        if (parseApiOrigin(apiUrl) !== apiOrigin) throw new Error("Unexpected remote API origin");
        return control.attach(accountId, apiOrigin, grant);
      },
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
        if (method.startsWith("host.") || method === "observed.remote")
          throw new Error("Use the native account coordination bridge");
        if (method === "roots.register")
          throw new Error("Use the native directory picker to authorize a directory");
        return engine.request(
          method,
          method.startsWith("connectors.") && params && typeof params === "object"
            ? {
                ...params,
                configDirs: {
                  ...connectionConfig.connectorDirectories,
                  ...(!connectionConfig.connectorDirectories.claude && process.env.CLAUDE_CONFIG_DIR
                    ? { claude: process.env.CLAUDE_CONFIG_DIR }
                    : {}),
                  ...(!connectionConfig.connectorDirectories.codex && process.env.CODEX_HOME
                    ? { codex: process.env.CODEX_HOME }
                    : {}),
                },
              }
            : method.startsWith("observed.") && params && typeof params === "object"
              ? { ...params, apiUrl: apiOrigin }
              : method.startsWith("agents.local.")
                ? scopeLocalAccount(connectionConfig.scope, params)
                : params,
        );
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
      restartEngine: ({ replaceOwner }) => (replaceOwner ? engine.replaceOwner() : engine.start()),
      saveAnalyticsPreferences: (input) => preferences.saveAnalytics(input),
      getAnalyticsPreferences: () => parseAnalyticsConsent(preferences.read().analytics),
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
  preload:
    connectionConfig.preload +
    `Object.defineProperty(window,"__raypxDaemon",{value:${daemonEngine}});` +
    preferences.preload(),
  partition,
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
    if (!daemonEngine) await control.detach();
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
    releaseInstance?.();
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
function openPending() {
  windowActions.show();
  void emitLocalEvent({
    version: 1,
    event: "approval.open",
    data: { scope: pendingScope ?? "local" },
  });
}
ElectrobunEvents.on("reopen", () => (pendingScope ? openPending() : windowActions.show()));
tray.setMenu([
  { type: "normal", label: "Show Raypx", action: "show" },
  { type: "normal", label: "Review requests / 处理请求", action: "pending" },
  { type: "normal", label: "Hide window", action: "hide" },
  { type: "separator" },
  { type: "normal", label: "Quit Raypx", action: "quit" },
]);
export function handleTrayAction(action: unknown) {
  if (action === "pending") openPending();
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
