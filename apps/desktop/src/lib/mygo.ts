import { DESKTOP_METHODS, type DesktopBridge, type DesktopMethod } from "../../bridge";

type EventPacket = { sequence: number; event: unknown } | { ready: true };
interface NativeRuntime {
  call<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
  channel(handler: (packet: EventPacket) => void): { close(): void };
}
declare global {
  interface Window {
    mygo?: NativeRuntime;
    readonly __raypxDesktopHost?: "mygo";
  }
}

export async function createMyGoBridge(dispatch: (event: unknown) => void): Promise<DesktopBridge> {
  const runtime = window.mygo;
  if (!runtime || window.__raypxDesktopHost !== "mygo") throw new Error("DESKTOP_REQUIRED");
  let ready!: () => void;
  let failed!: (error: unknown) => void;
  const subscribed = new Promise<void>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const channel = runtime.channel((packet) => {
    if ("ready" in packet) {
      ready();
      return;
    }
    const { sequence, event } = packet;
    try {
      dispatch(event);
      if (import.meta.env.MODE === "native-smoke")
        window.dispatchEvent(new CustomEvent("raypx-smoke-local-event", { detail: packet }));
    } finally {
      void runtime.call("Desktop.Acknowledge", sequence).catch(() => {});
    }
  });
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    channel.close();
    window.removeEventListener("pagehide", onPageHide);
  }
  function onPageHide() {
    failed(new Error("Desktop page closed"));
    close();
  }
  window.addEventListener("pagehide", onPageHide, { once: true });
  const subscription = Promise.resolve().then(() => runtime.call("Desktop.Subscribe", channel));
  // This call stays open for the page's lifetime; requests use separate calls.
  void subscription.then(
    () => {
      failed(new Error("Desktop event stream closed"));
      close();
    },
    (error: unknown) => {
      failed(error);
      close();
    },
  );
  const subscriptionTimer = setTimeout(() => {
    failed(new Error("Desktop event subscription timed out"));
    close();
  }, 5000);
  try {
    await subscribed;
  } catch (error) {
    close();
    throw error;
  } finally {
    clearTimeout(subscriptionTimer);
  }
  const request = new Proxy({} as DesktopBridge["request"], {
    get(_target, property) {
      if (typeof property !== "string" || !Object.hasOwn(DESKTOP_METHODS, property))
        return undefined;
      return (input: unknown, options?: { maxRequestTime?: number }) => {
        const response = runtime.call(
          "Desktop.Request",
          DESKTOP_METHODS[property as DesktopMethod],
          input,
        );
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
