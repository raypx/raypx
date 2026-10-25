import type { AnalyticsConsent } from "@raypx/analytics";
import type { LocalEvent, LocalMethod, RootGrant } from "@raypx/contracts/local";
import type { RPCSchema } from "electrobun/rpc";
import type { DeviceGrant } from "@raypx/contracts/tasks";
import type { ControlInfo } from "@raypx/contracts/terminal";
import type { DevicePreferences } from "../preferences";
import type { DesktopApiRequest, DesktopApiResponse } from "../api";
export type { DevicePreferences } from "../preferences";

export interface EngineStatus {
  status: "starting" | "ready" | "error";
  message?: string;
}
export interface DesktopRuntime {
  appVersion: string;
  platform: string;
  trayEnabled: boolean;
  engine: EngineStatus;
}
export type DesktopRpc = {
  bun: RPCSchema<{
    requests: {
      openExternal: { params: { url: string }; response: boolean };
      apiFetch: { params: DesktopApiRequest; response: DesktopApiResponse };
      apiCancel: { params: { id: string }; response: boolean };
      controlInfo: { params: { accountId: string }; response: ControlInfo };
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
      restartEngine: { params: Record<string, never>; response: boolean };
      getAnalyticsPreferences: { params: Record<string, never>; response: AnalyticsConsent };
      saveAnalyticsPreferences: { params: AnalyticsConsent; response: boolean };
      savePreferences: { params: DevicePreferences; response: boolean };
    };
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: { localEvent: LocalEvent };
  }>;
};
