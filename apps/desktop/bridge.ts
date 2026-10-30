import type { AnalyticsConsent } from "@raypx/analytics";
import type { LocalMethod, RootGrant } from "@raypx/contracts/local";
import type { DeviceGrant } from "@raypx/contracts/tasks";
import type { ControlInfo } from "@raypx/contracts/terminal";
import type { DevicePreferences } from "./preferences";
import type { DesktopApiRequest, DesktopApiResponse } from "./api";

interface EngineStatus {
  status: "starting" | "ready" | "error";
  message?: string;
  code?: string;
}
export interface DesktopRuntime {
  appVersion: string;
  platform: string;
  trayEnabled: boolean;
  engine: EngineStatus;
  features?: { localTerminalApprovals: boolean };
  compiledFeatures?: string[];
}
/** The native command vocabulary. The Go host validates the generated manifest. */
export const DESKTOP_METHODS = {
  openExternal: "open_external",
  apiFetch: "api_fetch",
  apiCancel: "api_cancel",
  controlInfo: "control_info",
  terminalSettings: "terminal_settings",
  terminalConfigure: "terminal_configure",
  controlSession: "control_session",
  controlEnable: "control_enable",
  controlRevoked: "control_revoked",
  controlAttach: "control_attach",
  controlDetach: "control_detach",
  getRuntime: "get_runtime",
  hideWindow: "hide_window",
  pickDirectory: "pick_directory",
  localRequest: "local_request",
  restartEngine: "restart_engine",
  getAnalyticsPreferences: "get_analytics_preferences",
  saveAnalyticsPreferences: "save_analytics_preferences",
  savePreferences: "save_preferences",
} as const;

type DesktopRequests = {
  openExternal: { params: { url: string }; response: boolean };
  apiFetch: { params: DesktopApiRequest; response: DesktopApiResponse };
  apiCancel: { params: { id: string }; response: boolean };
  controlInfo: { params: { accountId: string }; response: ControlInfo };
  terminalSettings: {
    params: { accountId: string };
    response: { enabled: boolean; rootIds: string[] };
  };
  terminalConfigure: {
    params: { accountId: string; enabled: boolean; rootIds: string[] };
    response: { enabled: boolean; rootIds: string[] };
  };
  controlSession: { params: { accountId: string | null }; response: boolean };
  controlEnable: { params: { accountId: string; enabled: boolean }; response: ControlInfo };
  controlRevoked: { params: { accountId: string }; response: ControlInfo };
  controlAttach: {
    params: { accountId: string; apiUrl: string; grant: DeviceGrant };
    response: ControlInfo;
  };
  controlDetach: { params: Record<string, never>; response: boolean };
  getRuntime: { params: Record<string, never>; response: DesktopRuntime };
  hideWindow: { params: Record<string, never>; response: boolean };
  pickDirectory: { params: Record<string, never>; response: RootGrant | null };
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
