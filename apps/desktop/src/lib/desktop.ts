import type { LocalEvent, LocalMethod, LocalParams, RootGrant } from "@raypx/contracts/local";
import type { DesktopRpc, DesktopRuntime } from "../../native/rpc";
import type { DevicePreferences } from "../../preferences";

export type { DesktopRuntime } from "../../native/rpc";
const listeners = new Set<(event: LocalEvent) => void>();
export function onLocalEvent(listener: (event: LocalEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function isDesktop() {
  return typeof window !== "undefined" && "__electrobunWebviewId" in window;
}
let bridge: ReturnType<typeof createBridge> | undefined;
async function createBridge() {
  const { Electroview } = await import("electrobun/view");
  const rpc = Electroview.defineRPC<DesktopRpc>({
    maxRequestTime: 600000,
    handlers: {
      requests: {},
      messages: {
        localEvent: (event) => {
          for (const listener of listeners) listener(event);
        },
      },
    },
  });
  new Electroview({ rpc });
  return rpc;
}
function getBridge() {
  if (!isDesktop()) throw new Error("DESKTOP_REQUIRED");
  return (bridge ??= createBridge());
}
export async function getDesktopRuntime(): Promise<DesktopRuntime> {
  if (!isDesktop())
    return {
      appVersion: "0.1.0",
      platform: "browser",
      trayEnabled: false,
      engine: { status: "error" },
    };
  return (await getBridge()).request.getRuntime({});
}
export async function pickDirectory(): Promise<RootGrant | null> {
  return (await getBridge()).request.pickDirectory({});
}
export async function restartEngine() {
  return (await getBridge()).request.restartEngine({});
}
export async function localRequest<T, M extends LocalMethod = LocalMethod>(
  method: M,
  params: LocalParams<M>,
): Promise<T> {
  return (await (await getBridge()).request.localRequest({ method, params })) as T;
}

let preferenceWrite: Promise<boolean> = Promise.resolve(false);
export async function saveDesktopPreferences(preferences: DevicePreferences) {
  if (!isDesktop()) return false;
  const snapshot = { ...preferences };
  const next = preferenceWrite
    .catch(() => false)
    .then(async () => (await getBridge()).request.savePreferences(snapshot));
  preferenceWrite = next;
  return next;
}
