import type { ApiClient } from "./index.js";
import { RelayConnection, relayUrl, type RelaySocketFactory } from "./relay.js";
import {
  taskSchema,
  humanRequestSchema,
  taskInputActivitySchema,
  type TaskInput,
  type RelayRequest,
  type RelayCursor,
  type TaskChange,
} from "@raypx/contracts/api";

type Input<M extends RelayRequest["method"]> = Extract<RelayRequest, { method: M }>["input"];
export interface TaskClient extends Pick<
  ApiClient,
  "account" | "devices" | "relay" | "tasks" | "approvals"
> {
  tasks: ApiClient["tasks"] & {
    create(
      input: Input<"tasks.create">,
      options?: { signal?: AbortSignal },
    ): Promise<ReturnType<typeof taskSchema.parse>>;
    followUp(
      input: Input<"tasks.followUp">,
      options?: { signal?: AbortSignal },
    ): Promise<ReturnType<typeof taskSchema.parse>>;
    cancel(
      input: Input<"tasks.cancel">,
      options?: { signal?: AbortSignal },
    ): Promise<ReturnType<typeof taskSchema.parse>>;
    input(input: Input<"tasks.input">, options?: { signal?: AbortSignal }): Promise<TaskInput>;
  };
  approvals: ApiClient["approvals"] & {
    decide(
      input: Input<"approvals.decide">,
      options?: { signal?: AbortSignal },
    ): Promise<ReturnType<typeof humanRequestSchema.parse>>;
  };
  subscribe(listener: (change?: TaskChange) => void): () => void;
  setAccount(accountId: string | null): void;
}
function failure(code: string) {
  return Object.assign(new Error(code), {
    code: code === "AUTH_REQUIRED" ? "UNAUTHORIZED" : "CONFLICT",
    data: { error: { code } },
  });
}
export function createTaskClient(
  api: ApiClient,
  options: { baseUrl: string; socket?: RelaySocketFactory },
): TaskClient {
  let account: string | null = null,
    connection: RelayConnection | undefined,
    connected = false;
  let terminalError: string | null = null;
  const inFlight = new Map<string, { key: string; promise: Promise<unknown> }>();
  const listeners = new Set<(change?: TaskChange) => void>(),
    cursors = new Map<string, RelayCursor>();
  const pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
      dispose(): void;
    }
  >();
  const changed = (change: TaskChange = { type: "reset" }) => {
    for (const listener of listeners) listener(change);
  };
  const rejectAll = (code: string) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.dispose();
      item.reject(failure(code));
    }
    pending.clear();
  };
  const stop = () => {
    connection?.stop();
    connection = undefined;
    connected = false;
    rejectAll("NETWORK_UNAVAILABLE");
  };
  const connect = () => {
    if (!account || connection || !listeners.size || terminalError) return;
    const currentAccount = account;
    connection = new RelayConnection({
      url: relayUrl(options.baseUrl, currentAccount),
      ...(options.socket ? { socket: options.socket } : {}),
      authenticate: async () => {
        const ticket = await api.relay.ticket({});
        if (account !== currentAccount) throw new Error("Account changed");
        return {
          type: "auth",
          protocolVersion: 2,
          role: "viewer",
          token: ticket.token,
          cursors: [...cursors.values()],
        };
      },
      status: (value, code) => {
        if (code === "UPGRADE_REQUIRED") terminalError = code;
        connected = value;
        if (!value) rejectAll(code ?? "NETWORK_UNAVAILABLE");
        changed();
      },
      message: (frame) => {
        if (frame.type === "changed") {
          cursors.set(frame.deviceId, {
            deviceId: frame.deviceId,
            streamId: frame.streamId,
            sequence: frame.sequence,
          });
          changed({
            type: frame.reset ? "reset" : frame.events ? "events" : "devices",
            deviceId: frame.deviceId,
            ...(frame.events ? { events: frame.events } : {}),
          });
        }
        if (frame.type === "result") {
          const item = pending.get(frame.id);
          if (!item) return;
          pending.delete(frame.id);
          clearTimeout(item.timer);
          item.dispose();
          if (frame.result.ok) item.resolve(frame.result.value);
          else item.reject(failure(frame.result.code));
          changed();
        }
      },
    });
    connection.start();
  };
  const subscribe = (listener: (change?: TaskChange) => void) => {
    listeners.add(listener);
    connect();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) stop();
    };
  };
  const sendRequest = async (value: RelayRequest, signal?: AbortSignal) => {
    if (terminalError) throw failure(terminalError);
    if (!connected) {
      if (!account) throw failure("AUTH_REQUIRED");
      connect();
      await new Promise<void>((resolve, reject) => {
        const dispose = () => {
          clearTimeout(timer);
          listeners.delete(ready);
          signal?.removeEventListener("abort", abort);
        };
        const ready = () => {
          if (terminalError) {
            dispose();
            reject(failure(terminalError));
            return;
          }
          if (connected) {
            dispose();
            resolve();
          } else if (!account) {
            dispose();
            reject(failure("AUTH_REQUIRED"));
          }
        };
        const abort = () => {
          dispose();
          reject(failure("NETWORK_UNAVAILABLE"));
        };
        const timer = setTimeout(abort, 10_000);
        listeners.add(ready);
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        else ready();
      });
    }
    if (!connection) throw failure("NETWORK_UNAVAILABLE");
    const id =
      value.method === "tasks.create" ||
      value.method === "tasks.followUp" ||
      value.method === "tasks.input"
        ? value.input.id
        : crypto.randomUUID();
    const key = JSON.stringify(value),
      old = inFlight.get(id);
    if (old) {
      if (old.key !== key) throw failure("IDEMPOTENCY_CONFLICT");
      return old.promise;
    }
    const operation = new Promise<unknown>((resolve, reject) => {
      if (signal?.aborted) {
        reject(failure("NETWORK_UNAVAILABLE"));
        return;
      }
      const abort = () => {
        const item = pending.get(id);
        if (item) {
          pending.delete(id);
          clearTimeout(item.timer);
          item.dispose();
          reject(failure("NETWORK_UNAVAILABLE"));
        }
      };
      const timer = setTimeout(abort, 15_000);
      pending.set(id, {
        resolve,
        reject,
        timer,
        dispose: () => signal?.removeEventListener("abort", abort),
      });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        connection!.send({ type: "request", id, request: value });
      } catch {
        abort();
      }
    });
    inFlight.set(id, { key, promise: operation });
    try {
      return await operation;
    } finally {
      if (inFlight.get(id)?.promise === operation) inFlight.delete(id);
    }
  };
  const request = async (value: RelayRequest, signal?: AbortSignal) => {
    const release = subscribe(() => {});
    try {
      return await sendRequest(value, signal);
    } finally {
      release();
    }
  };
  return {
    account: api.account,
    devices: api.devices,
    relay: api.relay,
    tasks: {
      list: (...args) =>
        terminalError ? Promise.reject(failure(terminalError)) : api.tasks.list(...args),
      get: (...args) =>
        terminalError ? Promise.reject(failure(terminalError)) : api.tasks.get(...args),
      create: async (input, opts) =>
        taskSchema.parse(await request({ method: "tasks.create", input }, opts?.signal)),
      followUp: async (input, opts) =>
        taskSchema.parse(await request({ method: "tasks.followUp", input }, opts?.signal)),
      cancel: async (input, opts) =>
        taskSchema.parse(await request({ method: "tasks.cancel", input }, opts?.signal)),
      input: async (input, opts) =>
        taskInputActivitySchema.parse(
          await request({ method: "tasks.input", input }, opts?.signal),
        ),
    },
    approvals: {
      list: (...args) => api.approvals.list(...args),
      decide: async (input, opts) =>
        humanRequestSchema.parse(
          await request({ method: "approvals.decide", input }, opts?.signal),
        ),
    },
    setAccount(value) {
      if (account === value) return;
      stop();
      account = value;
      terminalError = null;
      cursors.clear();
      connect();
      changed();
    },
    subscribe,
  };
}
