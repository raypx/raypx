import type { LocalEvent, LocalMethod, RootGrant } from "@raypx/contracts/local";
import type { RPCSchema } from "electrobun/rpc";
export interface DevicePreferences {
  theme: "system" | "light" | "dark";
  locale: "system" | "en" | "zh";
}

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
      getRuntime: { params: Record<string, never>; response: DesktopRuntime };
      hideWindow: { params: Record<string, never>; response: boolean };
      pickDirectory: { params: Record<string, never>; response: RootGrant | null };
      localRequest: { params: { method: LocalMethod; params: unknown }; response: unknown };
      restartEngine: { params: Record<string, never>; response: boolean };
      savePreferences: { params: DevicePreferences; response: boolean };
    };
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: { localEvent: LocalEvent };
  }>;
};
