import type { DesktopBridge, DesktopRuntime } from "../../bridge";
import type { LocalEvent, LocalParams } from "@raypx/contracts/local";
import type { LocalClientMethod, LocalResult } from "@raypx/contracts/local-client";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { createDesktopPlatform } from "../../src/lib/platform";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Per-case protocol fixture: unsupported operations fail rather than fabricate success. */
export function desktopFixture() {
  const local = new Map<string, (input: unknown) => unknown>();
  const native = new Map<string, (input: unknown) => Promise<unknown>>();
  const calls: { method: string; input: unknown }[] = [];
  let dispatch: ((value: unknown) => void) | undefined;
  const runtime: DesktopRuntime = {
    appVersion: "test",
    platform: "test",
    trayEnabled: false,
    engine: { status: "ready" },
  };
  const device: SyncDevice = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Test computer",
    platform: "test",
    appVersion: "test",
    epoch: 1,
    revoked: false,
    lastSeenAt: null,
    online: true,
    projects: [],
    capabilities: [],
  };
  function setLocal<M extends LocalClientMethod>(
    method: M,
    handler: (input: LocalParams<M>) => LocalResult<M> | Promise<LocalResult<M>>,
  ) {
    local.set(method, (input) => handler(input as LocalParams<M>));
  }
  function setNative<M extends keyof DesktopBridge["request"]>(
    method: M,
    handler: DesktopBridge["request"][M],
  ) {
    native.set(method, handler as (input: unknown) => Promise<unknown>);
  }
  const bridge: DesktopBridge = {
    request: new Proxy({} as DesktopBridge["request"], {
      get(_target, method) {
        return async (input: unknown) => {
          calls.push({ method: String(method), input });
          const handler = native.get(String(method));
          if (!handler) throw new Error(`Unexpected native request: ${String(method)}`);
          return handler(input);
        };
      },
    }),
  };
  setNative("getRuntime", async () => runtime);
  setNative("pickDirectory", async () => null);
  setNative("localRequest", async ({ method, params }) => {
    calls.push({ method, input: params });
    const handler = local.get(method);
    if (!handler) throw new Error(`Unexpected local request: ${method}`);
    return handler(params);
  });
  setLocal("agents.local.device", () => device);
  setLocal("agents.projects", () => device.projects);
  setLocal("agents.capabilities", () => device.capabilities);
  setLocal("instance.status", () => ({ state: "registered" }));
  setLocal("instance.refresh", () => ({ state: "registered" }));
  const platform = createDesktopPlatform({
    available: () => true,
    terminalHooks: () => false,
    connect: async (emit) => {
      dispatch = emit;
      return bridge;
    },
  });
  return {
    platform,
    runtime,
    device,
    bridge,
    calls,
    setLocal,
    setNative,
    emit(event: LocalEvent) {
      dispatch?.(event);
    },
  };
}
