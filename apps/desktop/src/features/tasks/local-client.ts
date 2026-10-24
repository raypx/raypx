import type { LocalEvent } from "@raypx/contracts/local";
import {
  taskSchema,
  humanRequestSchema,
  taskInputActivitySchema,
  type RelayRequest,
  type SyncDevice,
} from "@raypx/contracts/tasks";
import type { TaskWorkspaceClient } from "@raypx/tasks/client";
import { localRequest, onLocalEvent } from "../../lib/desktop";

function failure(code: string) {
  return Object.assign(new Error(code), { data: { error: { code } } });
}
export function createLocalTaskClient(
  request: typeof localRequest = localRequest,
  events: (listener: (event: LocalEvent) => void) => () => void = onLocalEvent,
): TaskWorkspaceClient & { setAccount(accountId: string | null): void } {
  let account: string | null = null;
  const listeners = new Set<() => void>();
  let stopEvents: (() => void) | undefined;
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const read = async <T>(run: (accountId: string) => Promise<T>, signal?: AbortSignal) => {
    const id = account;
    if (!id) throw failure("AUTH_REQUIRED");
    signal?.throwIfAborted();
    let value: T;
    try {
      value = await run(id);
    } catch {
      throw failure("LOCAL_UNAVAILABLE");
    }
    if (account !== id) throw failure("AUTH_REQUIRED");
    signal?.throwIfAborted();
    return value;
  };
  const inflight = new Map<string, Promise<unknown>>();
  // Cancel and decide have no client id, so identical in-flight calls share one command.
  const execute = (value: RelayRequest, signal?: AbortSignal) => {
    if (
      value.method === "tasks.create" ||
      value.method === "tasks.followUp" ||
      value.method === "tasks.input"
    )
      return send(value.input.id, value, signal);
    const key = JSON.stringify(value);
    let pending = inflight.get(key);
    if (!pending) {
      pending = send(crypto.randomUUID(), value, signal).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return pending;
  };
  const send = async (id: string, value: RelayRequest, signal?: AbortSignal) => {
    const result = await read(
      (accountId) =>
        request<{ ok: true; value: unknown } | { ok: false; code: string }>(
          "agents.local.execute",
          { accountId, id, request: value },
        ),
      signal,
    );
    changed();
    if (!result.ok) throw failure(result.code);
    return result.value;
  };
  return {
    devices: {
      list: (_input, options) =>
        read(
          async (accountId) => [await request<SyncDevice>("agents.local.device", { accountId })],
          options?.signal,
        ),
    },
    tasks: {
      list: (input, options) =>
        read(
          (accountId) =>
            request<Awaited<ReturnType<TaskWorkspaceClient["tasks"]["list"]>>>(
              "agents.local.list",
              { ...input, accountId },
            ),
          options?.signal,
        ),
      get: (input, options) =>
        read(
          (accountId) =>
            request<Awaited<ReturnType<TaskWorkspaceClient["tasks"]["get"]>>>("agents.local.get", {
              ...input,
              accountId,
            }),
          options?.signal,
        ),
      create: async (input, options) =>
        taskSchema.parse(await execute({ method: "tasks.create", input }, options?.signal)),
      followUp: async (input, options) =>
        taskSchema.parse(await execute({ method: "tasks.followUp", input }, options?.signal)),
      cancel: async (input, options) =>
        taskSchema.parse(await execute({ method: "tasks.cancel", input }, options?.signal)),
      input: async (input, options) =>
        taskInputActivitySchema.parse(
          await execute({ method: "tasks.input", input }, options?.signal),
        ),
    },
    approvals: {
      list: (_input, options) =>
        read(
          (accountId) =>
            request<Awaited<ReturnType<TaskWorkspaceClient["approvals"]["list"]>>>(
              "agents.local.approvals",
              { accountId },
            ),
          options?.signal,
        ),
      decide: async (input, options) =>
        humanRequestSchema.parse(
          await execute({ method: "approvals.decide", input }, options?.signal),
        ),
    },
    setAccount(id) {
      if (account !== id) {
        account = id;
        changed();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      stopEvents ??= events((event) => {
        if (event.event === "agent.changed" || event.event === "engine.status") changed();
      });
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stopEvents?.();
          stopEvents = undefined;
        }
      };
    },
  };
}
// The sidebar badge counts approvals from this computer and connected computers.
export function createPendingClient(
  local: TaskWorkspaceClient,
  remote: TaskWorkspaceClient,
): TaskWorkspaceClient {
  return {
    ...local,
    approvals: {
      ...local.approvals,
      list: async (input, options) => {
        const results = await Promise.allSettled([
          local.approvals.list(input, options),
          remote.approvals.list(input, options),
        ]);
        if (results.every((result) => result.status === "rejected"))
          throw (results[0] as PromiseRejectedResult).reason;
        return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
      },
    },
    subscribe(listener) {
      const stops = [local.subscribe(listener), remote.subscribe(listener)];
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
export const localTaskClient = createLocalTaskClient();
