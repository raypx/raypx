import { createLocalClient } from "@raypx/contracts/local-client";
import { localEventSchema, type LocalEvent, type RootGrant } from "@raypx/contracts/local";
import { type DesktopBridge, type DesktopRuntime } from "../../bridge";
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
  return typeof window !== "undefined" && window.__raypxDesktopHost === "mygo";
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
  return (await import("./mygo")).createMyGoBridge(dispatchLocalEvent);
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
export const localRequest = createLocalClient(async (method, params) =>
  (await getBridge()).request.localRequest({ method, params }),
);

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
