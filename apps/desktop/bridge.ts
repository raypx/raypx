import type { AnalyticsConsent } from "@raypx/analytics";
import type { LocalMethod } from "@raypx/contracts/local";
import type { DevicePreferences } from "./preferences.js";
import type { DesktopApiRequest, DesktopApiResponse } from "./api.js";
import type { DesktopEventsRead } from "@raypx/contracts/desktop";
import type { ConversationClientFrame } from "@raypx/contracts/api";

interface EngineStatus {
  status: "starting" | "ready" | "error";
  message?: string;
  code?: string;
  sessionRecovery?: "temporary" | null;
}
export interface DesktopRuntime {
  appVersion: string;
  platform: string;
  trayEnabled: boolean;
  engine: EngineStatus;
  compiledFeatures?: string[];
}
/** Product methods; the adapter routes business calls directly to the daemon. */
export const DESKTOP_METHODS = {
  openExternal: "open_external",
  browserLoginStart: "browser_login_start",
  browserLoginWait: "browser_login_wait",
  browserLoginCancel: "browser_login_cancel",
  apiFetch: "api_fetch",
  apiCancel: "api_cancel",
  eventsOpen: "events_open",
  eventsRead: "events_read",
  eventsSend: "events_send",
  eventsClose: "events_close",
  controlSession: "control_session",
  getRuntime: "get_runtime",
  hideWindow: "hide_window",
  pairDeviceConnector: "pair_device_connector",
  grantDeviceDirectory: "grant_device_directory",
  localRequest: "local_request",
  restartEngine: "restart_engine",
  getAnalyticsPreferences: "get_analytics_preferences",
  saveAnalyticsPreferences: "save_analytics_preferences",
  savePreferences: "save_preferences",
  recoverSession: "recover_session",
} as const;

type DesktopRequests = {
  recoverSession: { params: Record<string, never>; response: boolean };
  browserLoginStart: {
    params: { id: string; webOrigin: string };
    response: { authorizationUrl: string };
  };
  browserLoginWait: { params: { id: string }; response: true };
  browserLoginCancel: { params: { id: string }; response: true };
  openExternal: { params: { url: string }; response: boolean };
  apiFetch: { params: DesktopApiRequest; response: DesktopApiResponse };
  apiCancel: { params: { id: string }; response: boolean };
  eventsOpen: { params: { id: string; accountId: string }; response: true };
  eventsRead: { params: { id: string }; response: DesktopEventsRead };
  eventsSend: { params: { id: string; frame: ConversationClientFrame }; response: true };
  eventsClose: { params: { id: string }; response: true };
  controlSession: { params: { accountId: string | null }; response: boolean };
  getRuntime: { params: Record<string, never>; response: DesktopRuntime };
  hideWindow: { params: Record<string, never>; response: boolean };
  pairDeviceConnector: { params: { code: string }; response: boolean };
  grantDeviceDirectory: { params: { spaceId: string; deviceId: string }; response: boolean };
  localRequest: { params: { method: LocalMethod; params: unknown }; response: unknown };
  restartEngine: { params: { replaceOwner?: boolean }; response: boolean };
  getAnalyticsPreferences: { params: Record<string, never>; response: AnalyticsConsent };
  saveAnalyticsPreferences: { params: AnalyticsConsent; response: boolean };
  savePreferences: { params: DevicePreferences; response: boolean };
};

export type DesktopMethod = keyof typeof DESKTOP_METHODS;
type DesktopRequest = {
  [M in DesktopMethod]: (
    params: DesktopRequests[M]["params"],
    options?: { maxRequestTime?: number },
  ) => Promise<DesktopRequests[M]["response"]>;
};
export interface DesktopBridge {
  request: DesktopRequest;
}
