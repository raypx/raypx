import {
  localEventSchema,
  type LocalEvent,
  type LocalMethod,
  type LocalParams,
  type RootGrant,
} from "@raypx/contracts/local";
import {
  DESKTOP_METHODS,
  type DesktopBridge,
  type DesktopMethod,
  type DesktopRuntime,
} from "../../bridge";
import type { DevicePreferences } from "../../preferences";

export type { DesktopRuntime } from "../../bridge";
const listeners = new Set<(event: LocalEvent) => void>();
export function onLocalEvent(listener: (event: LocalEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function isDesktop() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
/** Local terminal approvals need the independent daemon's hook host. */
export function hasTerminalHooks() {
  return (
    typeof window !== "undefined" &&
    "__raypxTerminalHooks" in window &&
    window.__raypxTerminalHooks === true
  );
}
function dispatchLocalEvent(value: unknown) {
  const event = localEventSchema.safeParse(value);
  if (!event.success) return;
  for (const listener of listeners) listener(event.data);
}
let bridge: Promise<DesktopBridge> | undefined;
async function createBridge(): Promise<DesktopBridge> {
  const { Channel, invoke } = await import("@tauri-apps/api/core");
  const channel = new Channel<{ sequence: number; event: unknown }>();
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- Tauri Channel exposes a single onmessage callback.
  channel.onmessage = ({ sequence, event }) => {
    try {
      dispatchLocalEvent(event);
    } finally {
      void invoke("ack_local_events", { input: { sequence } }).catch(() => {});
    }
  };
  // Hold the channel for the WebView lifetime, including periods with no listeners.
  await invoke("subscribe_local_events", { channel });
  const request = new Proxy({} as DesktopBridge["request"], {
    get(_target, property) {
      if (typeof property !== "string" || !Object.hasOwn(DESKTOP_METHODS, property))
        return undefined;
      return (input: unknown, options?: { maxRequestTime?: number }) => {
        const response = invoke(DESKTOP_METHODS[property as DesktopMethod], { input });
        if (!options?.maxRequestTime) return response;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Desktop request timed out")),
            options.maxRequestTime,
          );
          response.then(resolve, reject).finally(() => clearTimeout(timer));
        });
      };
    },
  });
  return { request };
}

export function getBridge() {
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
export async function restartEngine(replaceOwner = false) {
  return (await getBridge()).request.restartEngine({ replaceOwner });
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
