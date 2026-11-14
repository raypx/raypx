import {
  desktopChannelSchema,
  desktopServerFrameSchema,
  type DesktopClientFrame,
  desktopExecutionRequests,
  desktopExecutionResults,
  desktopLoginRequests,
  desktopLoginResults,
  desktopEventsRequests,
  desktopEventsResults,
  desktopDeviceRequests,
  desktopDeviceResults,
} from "@raypx/contracts/desktop";
import {
  DESKTOP_METHODS,
  type DesktopBridge,
  type DesktopMethod,
  type DesktopRuntime,
} from "../../bridge.js";

interface NativeRuntime {
  call<T = unknown>(method: string, ...args: unknown[]): Promise<T>;
}
declare global {
  interface Window {
    mygo?: NativeRuntime;
    readonly __raypxDesktopHost?: "mygo";
  }
}
const nativeMethods = new Set<DesktopMethod>([
  "openExternal",
  "getRuntime",
  "hideWindow",
  "pickDirectory",
  "restartEngine",
  "getAnalyticsPreferences",
  "saveAnalyticsPreferences",
  "savePreferences",
]);
const frameLimit = 8 * 1024 * 1024;

export async function createMyGoBridge(dispatch: (event: unknown) => void): Promise<DesktopBridge> {
  const native = window.mygo;
  if (!native || window.__raypxDesktopHost !== "mygo") throw new Error("DESKTOP_REQUIRED");
  const runtime: NativeRuntime = native;
  const pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: unknown): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  interface Connection {
    controller: AbortController;
    socket?: WebSocket;
    opening?: Promise<void>;
    ready: boolean;
  }
  let connection: Connection | undefined;
  let closed = false;
  function status(value: { status: string; code?: string }) {
    dispatch({ version: 1, event: "engine.status", data: value });
  }
  function retire(error = new Error("HOST_UNAVAILABLE")) {
    const previous = connection;
    connection = undefined;
    previous?.controller.abort(error);
    previous?.socket?.close();
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  }
  function send(frame: DesktopClientFrame) {
    const encoded = JSON.stringify(frame);
    const socket = connection?.socket;
    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      new TextEncoder().encode(encoded).byteLength + socket.bufferedAmount > frameLimit
    )
      throw new Error("HOST_UNAVAILABLE");
    socket.send(encoded);
  }
  async function open() {
    if (closed) throw new Error("Desktop page closed");
    if (connection?.ready) return connection;
    if (connection?.opening) {
      const current = connection;
      await current.opening;
      current.controller.signal.throwIfAborted();
      return current;
    }
    const current: Connection = { controller: new AbortController(), ready: false };
    connection = current;
    const { signal } = current.controller;
    const operation = new Promise<void>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      void (async () => {
        const descriptor = desktopChannelSchema.parse(
          await runtime.call("Desktop.Request", "get_channel", {}),
        );
        signal.throwIfAborted();
        const channel = new WebSocket(descriptor.url);
        current.socket = channel;
        let streamId: string | undefined;
        let sequence = 0;
        const fail = (error = new Error("HOST_UNAVAILABLE")) => {
          if (connection !== current) return;
          retire(error);
          if (!closed) status({ status: "error", code: "HOST_UNAVAILABLE" });
        };
        const timer = setTimeout(() => fail(new Error("Desktop channel timed out")), 5000);
        signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
        channel.addEventListener("open", () => {
          if (signal.aborted) return;
          try {
            send({ type: "authenticate", protocol: 1, capability: descriptor.capability });
          } catch {
            fail();
          }
        });
        channel.addEventListener("close", () => fail());
        channel.addEventListener("error", () => fail());
        channel.addEventListener("message", ({ data }) => {
          if (signal.aborted) return;
          let packet;
          try {
            if (typeof data !== "string" || new TextEncoder().encode(data).byteLength > frameLimit)
              throw new Error("INVALID_FRAME");
            packet = desktopServerFrameSchema.parse(JSON.parse(data));
          } catch {
            fail();
            return;
          }
          if (packet.type === "ready") {
            if (streamId) {
              fail();
              return;
            }
            streamId = packet.streamId;
            current.ready = true;
            clearTimeout(timer);
            resolve();
            return;
          }
          if (!streamId) {
            fail();
            return;
          }
          if (packet.type === "response") {
            const entry = pending.get(packet.id);
            if (!entry) return;
            pending.delete(packet.id);
            clearTimeout(entry.timer);
            if (packet.error)
              entry.reject(
                Object.assign(new Error(packet.error.code), { code: packet.error.code }),
              );
            else if (Object.hasOwn(packet, "result")) entry.resolve(packet.result);
            else {
              entry.reject(new Error("INVALID_FRAME"));
              fail();
            }
            return;
          }
          if (packet.streamId !== streamId || packet.sequence !== sequence + 1) {
            fail();
            return;
          }
          sequence = packet.sequence;
          try {
            dispatch(packet.event);
            if (import.meta.env.MODE === "native-smoke")
              window.dispatchEvent(new CustomEvent("raypx-smoke-local-event", { detail: packet }));
          } finally {
            if (!signal.aborted) {
              try {
                send({ type: "ack", streamId, sequence });
              } catch {
                fail();
              }
            }
          }
        });
      })().catch(reject);
    });
    current.opening = operation;
    try {
      await operation;
      signal.throwIfAborted();
      return current;
    } catch (error) {
      if (connection === current) retire();
      throw error;
    } finally {
      delete current.opening;
    }
  }
  function onPageHide() {
    closed = true;
    retire(new Error("Desktop page closed"));
    window.removeEventListener("pagehide", onPageHide);
  }
  window.addEventListener("pagehide", onPageHide, { once: true });
  // Even a failed daemon connection must leave native runtime/replacement controls usable.
  await open().catch(() => {});
  async function requestDaemon(
    method: string,
    params: unknown,
    timeout = 24 * 60 * 60 * 1000 + 10_000,
  ) {
    const current = await open();
    current.controller.signal.throwIfAborted();
    if (pending.size >= 64) throw new Error("Desktop channel busy");
    const id = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        try {
          send({ type: "cancel", id });
        } catch {
          /* The connection already cancelled its work. */
        }
        reject(new Error("Desktop request timed out"));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      try {
        send({ type: "request", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }
  const request = new Proxy({} as DesktopBridge["request"], {
    get(_target, property) {
      if (typeof property !== "string" || !Object.hasOwn(DESKTOP_METHODS, property))
        return undefined;
      const key = property as DesktopMethod;
      return async (input: unknown, options?: { maxRequestTime?: number }) => {
        if (closed) throw new Error("Desktop page closed");
        if (key === "restartEngine") {
          const result = await runtime.call("Desktop.Request", "restart_engine", input);
          if (result) {
            retire();
            await open();
            status({ status: "ready" });
          }
          return result;
        }
        if (key === "recoverSession") {
          const result = await runtime.call("Desktop.Request", "recover_session", input);
          if (result) {
            retire();
            await open();
            status({ status: "ready" });
          }
          return result;
        }
        if (key === "getRuntime") {
          const value = await runtime.call<DesktopRuntime>("Desktop.Request", "get_runtime", input);
          return !connection?.ready && value.engine.status === "ready"
            ? { ...value, engine: { status: "error", code: "HOST_UNAVAILABLE" } }
            : value;
        }
        const nativeMethod = DESKTOP_METHODS[key];
        if (Object.hasOwn(desktopDeviceRequests, nativeMethod)) {
          const action = nativeMethod as keyof typeof desktopDeviceRequests;
          return desktopDeviceResults[action].parse(
            await runtime.call(
              "Desktop.Request",
              action,
              desktopDeviceRequests[action].parse(input),
            ),
          );
        }
        if (nativeMethods.has(key))
          return runtime.call("Desktop.Request", DESKTOP_METHODS[key], input);
        if (
          key === "localRequest" &&
          input &&
          typeof input === "object" &&
          "method" in input &&
          input.method === "connectors.install" &&
          "params" in input &&
          input.params &&
          typeof input.params === "object" &&
          "recoverModified" in input.params &&
          input.params.recoverModified === true
        ) {
          const provider = "provider" in input.params ? input.params.provider : undefined;
          return runtime.call("Desktop.Request", "repair_connector", { provider });
        }
        const method = DESKTOP_METHODS[key];
        if (Object.hasOwn(desktopEventsRequests, method)) {
          const action = method as keyof typeof desktopEventsRequests;
          return desktopEventsResults[action].parse(
            await requestDaemon(action, desktopEventsRequests[action].parse(input), 30_000),
          );
        }
        if (Object.hasOwn(desktopExecutionRequests, method)) {
          const query = method as keyof typeof desktopExecutionRequests;
          return desktopExecutionResults[query].parse(
            await requestDaemon(
              query,
              desktopExecutionRequests[query].parse(input),
              options?.maxRequestTime,
            ),
          );
        }
        if (Object.hasOwn(desktopLoginRequests, method)) {
          const action = method as keyof typeof desktopLoginRequests;
          return desktopLoginResults[action].parse(
            await requestDaemon(
              action,
              desktopLoginRequests[action].parse(input),
              options?.maxRequestTime,
            ),
          );
        }
        return requestDaemon(method, input, options?.maxRequestTime);
      };
    },
  });
  if (import.meta.env.MODE === "native-smoke") {
    Object.defineProperty(window, "__raypxSmokeRequest", {
      configurable: true,
      value: (method: string, input: unknown) => {
        const key = Object.entries(DESKTOP_METHODS).find(([, value]) => value === method)?.[0];
        if (!key) throw new Error("METHOD_NOT_PERMITTED");
        return (Reflect.get(request, key) as (input: unknown) => Promise<unknown>)(input);
      },
    });
  }
  return { request };
}
