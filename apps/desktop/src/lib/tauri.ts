import { Channel, invoke } from "@tauri-apps/api/core";
import { DESKTOP_METHODS, type DesktopBridge, type DesktopMethod } from "../../bridge.ts";

type EventPacket =
  | { sequence: number; subscription: number; event: unknown }
  | { ready: true; subscription: number };
declare global {
  interface Window {
    readonly __raypxDesktopHost?: "tauri";
  }
}
export async function createTauriBridge(
  dispatch: (event: unknown) => void,
): Promise<DesktopBridge> {
  if (window.__raypxDesktopHost !== "tauri") throw new Error("DESKTOP_REQUIRED");
  let subscription: number | undefined;
  let closed = false;
  let ready!: () => void;
  let fail!: (error: unknown) => void;
  const subscribed = new Promise<void>((resolve, reject) => {
    ready = resolve;
    fail = reject;
  });
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener("pagehide", onPageHide);
    if (subscription !== undefined)
      void invoke("desktop_unsubscribe", { subscription }).catch(() => {});
  };
  function onPageHide() {
    fail(new Error("Desktop page closed"));
    close();
  }
  window.addEventListener("pagehide", onPageHide, { once: true });
  const channel = new Channel<EventPacket>((packet) => {
    if ("ready" in packet) {
      subscription = packet.subscription;
      if (closed) void invoke("desktop_unsubscribe", { subscription }).catch(() => {});
      else ready();
      return;
    }
    if (closed || packet.subscription !== subscription) return;
    try {
      dispatch(packet.event);
      if (import.meta.env.MODE === "native-smoke")
        window.dispatchEvent(new CustomEvent("raypx-smoke-local-event", { detail: packet }));
    } finally {
      void invoke("desktop_acknowledge", { subscription, sequence: packet.sequence }).catch(
        () => {},
      );
    }
  });
  void invoke<number>("desktop_subscribe", { channel }).then((generation) => {
    subscription = generation;
    if (closed) void invoke("desktop_unsubscribe", { subscription }).catch(() => {});
  }, fail);
  const timer = setTimeout(() => fail(new Error("Desktop event subscription timed out")), 5000);
  try {
    await subscribed;
  } catch (error) {
    close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const request = new Proxy({} as DesktopBridge["request"], {
    get(_target, property) {
      if (typeof property !== "string" || !Object.hasOwn(DESKTOP_METHODS, property))
        return undefined;
      return (input: unknown, options?: { maxRequestTime?: number }) => {
        const response = invoke("desktop_request", {
          method: DESKTOP_METHODS[property as DesktopMethod],
          input,
        });
        if (!options?.maxRequestTime) return response;
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Desktop request timed out")),
            options.maxRequestTime,
          );
          void response.then(resolve, reject).finally(() => clearTimeout(timeout));
        });
      };
    },
  });
  return { request };
}
