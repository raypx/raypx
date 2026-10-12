import type { RPCSchema } from "electrobun/rpc";

export interface DesktopRuntime {
  appVersion: string;
  platform: string;
  trayEnabled: boolean;
}

export type DesktopRpc = {
  bun: RPCSchema<{
    requests: {
      getRuntime: { params: Record<string, never>; response: DesktopRuntime };
      hideWindow: { params: Record<string, never>; response: boolean };
    };
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: Record<string, never>;
  }>;
};
