import { createLocalClient } from "@raypx/contracts/local-client";
import { localEventSchema, type LocalEvent } from "@raypx/contracts/local";
import type { DesktopBridge, DesktopRuntime } from "../../bridge.js";
import type { DevicePreferences } from "../../preferences.js";

export function createDesktopPlatform(options: {
  available(): boolean;
  connect(dispatch: (event: unknown) => void): Promise<DesktopBridge>;
}) {
  const listeners = new Set<(event: LocalEvent) => void>();
  let bridge: Promise<DesktopBridge> | undefined;
  let preferenceWrite: Promise<boolean> = Promise.resolve(false);
  function dispatch(value: unknown) {
    const event = localEventSchema.safeParse(value);
    if (event.success) for (const listener of listeners) listener(event.data);
  }
  function getBridge() {
    if (!options.available()) throw new Error("DESKTOP_REQUIRED");
    if (!bridge) {
      const connecting = Promise.resolve().then(() => options.connect(dispatch));
      bridge = connecting;
      void connecting.catch(() => {
        if (bridge === connecting) bridge = undefined;
      });
    }
    return bridge;
  }
  return {
    isDesktop: () => options.available(),
    getBridge,
    onLocalEvent: (listener: (event: LocalEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getDesktopRuntime: async (): Promise<DesktopRuntime> => {
      if (!options.available())
        return {
          appVersion: "0.1.0",
          platform: "browser",
          trayEnabled: false,
          engine: { status: "error" },
        };
      return (await getBridge()).request.getRuntime({});
    },
    pairDeviceConnector: async (code: string) => {
      return (await getBridge()).request.pairDeviceConnector({ code });
    },
    grantDeviceDirectory: async (input: { spaceId: string; deviceId: string }) => {
      return (await getBridge()).request.grantDeviceDirectory(input);
    },
    restartEngine: async (replaceOwner = false) => {
      return (await getBridge()).request.restartEngine({ replaceOwner });
    },
    localRequest: createLocalClient(async (method, params) =>
      (await getBridge()).request.localRequest({ method, params }),
    ),
    saveDesktopPreferences: async (preferences: DevicePreferences) => {
      if (!options.available()) return false;
      const snapshot = { ...preferences };
      const next = preferenceWrite
        .catch(() => false)
        .then(async () => (await getBridge()).request.savePreferences(snapshot));
      preferenceWrite = next;
      return next;
    },
  };
}
export type DesktopPlatform = ReturnType<typeof createDesktopPlatform>;
