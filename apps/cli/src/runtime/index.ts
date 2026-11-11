import { createLocalRouter } from "./router";
import { PiHost } from "./agents/pi/host";
import { InstanceRuntime } from "./instances";
import { instanceKeys } from "./instances/keys";
import { join } from "node:path";
import { type LocalMethod } from "@raypx/contracts/local";
import { MemoryRuntime } from "./memory";
import { AgentRuntime } from "./agents";
import { FileRuntime } from "./files";
import { JobRuntime } from "./jobs";
import { ProcessRuntime } from "./process";
import { BundledBun } from "./process/bun";
import { StateStore, profilePath, acquireLock } from "./state";
import { LocalError } from "./errors";

import { recordDiagnostic } from "../diagnostics";
import type { RuntimeOptions } from "./options";

import { ProfileStorage } from "./sqlite";

export function createRuntime(options: RuntimeOptions = {}) {
  const scheduler = options.mode === "stdio" || options.mode === "daemon";
  const emit = options.emit ?? (() => {});
  const storage = new ProfileStorage(profilePath(options));
  const instances = new InstanceRuntime(profilePath(options), {
    keys: instanceKeys(storage.database),
    onProgress: (status, id) =>
      recordDiagnostic(options.recordDiagnostic, { operation: "instance.enrollment", status, id }),
  });
  const instanceAccess = options.instanceAccess ?? instances;
  let state: StateStore;
  try {
    state = new StateStore(storage);
  } catch (error) {
    storage.close();
    throw error;
  }
  const bun = new BundledBun(join(state.directory, "bun"));
  const environment = () => bun.environment();
  let releaseOwner: (() => void) | undefined;
  const ownAgents = () => {
    if (releaseOwner) return;
    const release = acquireLock(state.directory, "agents-owner");
    if (!release)
      throw new LocalError("HOST_RUNNING", "An execution host already owns this profile");
    releaseOwner = release;
  };
  let agentHost: AgentRuntime | undefined;
  const getAgents = (): AgentRuntime => {
    ownAgents();
    return (agentHost ??= new AgentRuntime(
      state,
      (pendingRequest, change) =>
        emit({
          version: 1,
          event: "agent.changed",
          data: {
            ...(pendingRequest ? { pendingRequest } : {}),
            ...(change ? { change, local: change.local } : {}),
          },
        }),
      {
        resolveContext: (selection, target, prompt) =>
          getMemory().resolve(selection, target, prompt),
        environment,
        pi,
        assertInstance: () => instanceAccess.assert(),
        ...(options.agentExecutables ? { executables: options.agentExecutables } : {}),
        ...(options.recordDiagnostic ? { recordDiagnostic: options.recordDiagnostic } : {}),
      },
    ));
  };
  const files = new FileRuntime(state);
  const processes = new ProcessRuntime(
    emit,
    process.env.RAYPX_HERDR_BINARY,
    environment,
    state.directory,
  );
  const pi = new PiHost(state, files, processes);
  const jobs = new JobRuntime(state, files, processes, emit, options.recordDiagnostic, () =>
    instanceAccess.assert(),
  );
  let memory: MemoryRuntime | undefined;
  const getMemory = (): MemoryRuntime =>
    (memory ??= new MemoryRuntime(state.db, (target) => getAgents().validateProject(target)));
  let closing = false;
  let closingPromise: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  let refreshing: Promise<import("@raypx/instances").InstanceStatus> | undefined;
  const refreshInstance = () => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const status = await instances.refresh();
      if (status.state === "revoked") {
        await Promise.allSettled([
          jobs.close(),
          processes.close(),
          ...(agentHost ? [agentHost.close()] : []),
          ...(options.onInstanceRevoked ? [options.onInstanceRevoked()] : []),
        ]);
      }
      return status;
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  };
  const syncInstance = () => {
    if (!closing) void refreshInstance().catch(() => {});
  };
  try {
    if (options.mode === "daemon") ownAgents();
    if (scheduler) jobs.startScheduler();
  } catch (error) {
    releaseOwner?.();
    storage.close();
    throw error;
  }
  const instanceTimer = options.instanceAccess ? undefined : setInterval(syncInstance, 300_000);
  instanceTimer?.unref();
  if (!options.instanceAccess) syncInstance();

  const dispatch = createLocalRouter({
    instances,
    instanceAccess,
    getAgents,
    getMemory,
    files,
    jobs,
    processes,
    state,
    pi,
    bun,
    refreshInstance,
    options: { ...options, scheduler },
  });
  return {
    state,
    instances,
    instanceAccess,
    files,
    jobs,
    processes,
    get agents() {
      return getAgents();
    },
    activeAgentTaskIds: () => agentHost?.activeTaskIds() ?? [],
    stopAgentTasks: (ids: readonly string[]) => agentHost?.stopTasks(ids),
    request(method: LocalMethod, raw: unknown, signal?: AbortSignal): Promise<unknown> {
      if (closing)
        return Promise.reject(new LocalError("CLOSING", "Local engine is shutting down"));
      const operation = (async () => {
        return dispatch(method, raw, signal);
      })();
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      );
      return operation;
    },
    close() {
      if (closingPromise) return closingPromise;
      closing = true;
      if (instanceTimer) clearInterval(instanceTimer);
      closingPromise = (async () => {
        // Stop producers and cancel execution first. File requests already
        // accepted must finish their state lookups before SQLite is closed.
        await Promise.allSettled([
          jobs.close(),
          processes.close(),
          ...(agentHost ? [agentHost.close()] : []),
        ]);
        await Promise.allSettled([...pending, ...(refreshing ? [refreshing] : [])]);
        storage.close();
        releaseOwner?.();
      })();
      return closingPromise;
    },
  };
}
export type LocalRuntime = ReturnType<typeof createRuntime>;
