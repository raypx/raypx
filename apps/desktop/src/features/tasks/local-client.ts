import { LOCAL_WORKSPACE_ID, type LocalEvent } from "@raypx/contracts/local";
import {
  taskSchema,
  humanRequestSchema,
  taskInputActivitySchema,
  type RelayRequest,
  type SyncDevice,
  taskChangeSchema,
  type TaskChange,
} from "@raypx/contracts/tasks";
import type { TaskWorkspaceClient } from "@raypx/tasks/client";
import { localRequest, onLocalEvent, hasTerminalHooks } from "../../lib/desktop";
import { observedProjectionSchema, terminalRequestSchema } from "@raypx/contracts/terminal";

function failure(code: string) {
  return Object.assign(new Error(code), { data: { error: { code } } });
}
export function createLocalTaskClient(
  request: typeof localRequest = localRequest,
  events: (listener: (event: LocalEvent) => void) => () => void = onLocalEvent,
  configuration: { owner?: string; observed?: boolean } = {},
): TaskWorkspaceClient & { setAccount(accountId: string | null): void } {
  let account: string | null = configuration.owner ?? null;
  const listeners = new Set<(change?: TaskChange) => void>();
  let stopEvents: (() => void) | undefined;
  const changed = (change?: TaskChange) => {
    for (const listener of listeners) listener(change);
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
    ...(configuration.observed && hasTerminalHooks()
      ? {
          observed: {
            list: (_input, options) =>
              read(
                async () =>
                  observedProjectionSchema.parse(await request("approvals.local.list", {})),
                options?.signal,
              ),
            get: (input, options) =>
              read(
                async () =>
                  terminalRequestSchema.parse(
                    await request("approvals.local.get", { id: input.id }),
                  ),
                options?.signal,
              ),
            decide: (decision, options) =>
              read(
                async () =>
                  terminalRequestSchema.parse(
                    await request("approvals.local.decide", { decision }),
                  ),
                options?.signal,
              ),
          },
        }
      : {}),
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
      if (configuration.owner) return;
      if (account !== id) {
        account = id;
        changed();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      stopEvents ??= events((event) => {
        if (event.event === "agent.changed") {
          const change = taskChangeSchema.safeParse(event.data.change);
          if (!change.success || change.data.local !== false)
            changed(change.success ? change.data : undefined);
        } else if (event.event === "engine.status" || event.event === "observed.changed") changed();
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
  let localRequests = new Map<string, string>();
  const refreshLocal = async (options?: { signal?: AbortSignal | undefined }) => {
    if (!local.observed) return;
    const projection = await local.observed.list({}, options);
    localRequests = new Map(projection.requests.map((request) => [request.id, request.epoch]));
  };
  return {
    ...local,
    ...(local.observed || remote.observed
      ? {
          observed: {
            list: async (input, options) => {
              const results = await Promise.allSettled([
                local.observed?.list(input, options),
                remote.observed?.list(input, options),
              ]);
              if (results.every((result) => result.status === "rejected"))
                throw (results[0] as PromiseRejectedResult).reason;
              const own = results[0];
              if (own?.status === "fulfilled" && own.value)
                localRequests = new Map(
                  own.value.requests.map((request) => [request.id, request.epoch]),
                );
              const values = [...results]
                .reverse()
                .flatMap((result) =>
                  result.status === "fulfilled" && result.value ? [result.value] : [],
                );
              return {
                sessions: [
                  ...new Map(
                    values.flatMap((value) => value.sessions).map((value) => [value.id, value]),
                  ).values(),
                ],
                requests: [
                  ...new Map(
                    values
                      .flatMap((value) => value.requests)
                      .map((value) => [`${value.id}:${value.epoch}`, value]),
                  ).values(),
                ],
              };
            },
            get: async (input, options) => {
              await refreshLocal(options);
              return (
                localRequests.has(input.id) ? local.observed! : (remote.observed ?? local.observed!)
              ).get(input, options);
            },
            decide: async (input, options) => {
              await refreshLocal(options);
              const target =
                localRequests.get(input.id) === input.epoch
                  ? local.observed!
                  : (remote.observed ?? local.observed!);
              return target.decide(input, options);
            },
          },
        }
      : {}),
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
export const localTaskClient = createLocalTaskClient(undefined, undefined, {
  owner: LOCAL_WORKSPACE_ID,
  observed: true,
});
/** Legacy account-owned history and account-authorized terminal requests stay isolated. */
export const accountLocalTaskClient = createLocalTaskClient();
