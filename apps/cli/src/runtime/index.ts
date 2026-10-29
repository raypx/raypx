import { join } from "node:path";
import {
  localParams,
  LOCAL_WORKSPACE_ID,
  type LocalEvent,
  type LocalMethod,
} from "@raypx/contracts/local";
import { MemoryRuntime } from "./memory";
import { ContextError } from "@raypx/memory";
import { AgentRuntime } from "./agents";
import { FileRuntime } from "./files";
import { JobRuntime } from "./jobs";
import { ProcessRuntime } from "./process";
import { BundledBun } from "./process/bun";
import { StateStore, profilePath, acquireLock } from "./state";
import { LocalError } from "./errors";
import manifest from "../../package.json";
import type { AgentProvider } from "@raypx/contracts/tasks";
import type { RecordDiagnostic } from "../diagnostics";

const contextParams = <T>(schema: { parse(input: unknown): T }, input: unknown): T => {
  try {
    return schema.parse(input);
  } catch {
    throw new ContextError("INVALID_CONTEXT");
  }
};

export function createRuntime(
  options: {
    dataDir?: string;
    profile?: string;
    emit?: (event: LocalEvent) => void;
    scheduler?: boolean;
    exclusiveOwner?: boolean;
    agentExecutables?: Partial<Record<AgentProvider, string>>;
    recordDiagnostic?: RecordDiagnostic;
  } = {},
) {
  const emit = options.emit ?? (() => {});
  const state = new StateStore(profilePath(options));
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
  const getAgents = () => {
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
  const jobs = new JobRuntime(state, files, processes, emit, options.recordDiagnostic);
  let memory: MemoryRuntime | undefined;
  const getMemory = () => (memory ??= new MemoryRuntime(state.directory, getAgents));
  let closing = false;
  let closingPromise: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  try {
    if (options.exclusiveOwner) ownAgents();
    if (options.scheduler) jobs.startScheduler();
  } catch (error) {
    releaseOwner?.();
    state.close();
    throw error;
  }
  return {
    state,
    files,
    jobs,
    processes,
    get agents() {
      return getAgents();
    },
    request(method: LocalMethod, raw: unknown): Promise<unknown> {
      if (closing)
        return Promise.reject(new LocalError("CLOSING", "Local engine is shutting down"));
      const operation = (async () => {
        // Narrow each schema independently to preserve method-specific types.
        switch (method) {
          case "memory.list":
            contextParams(localParams[method], raw);
            return getMemory().service.list(LOCAL_WORKSPACE_ID);
          case "memory.get":
            return getMemory().service.get(
              LOCAL_WORKSPACE_ID,
              contextParams(localParams[method], raw),
            );
          case "memory.create":
            return getMemory().service.create(
              LOCAL_WORKSPACE_ID,
              contextParams(localParams[method], raw),
            );
          case "memory.update":
            return getMemory().service.update(
              LOCAL_WORKSPACE_ID,
              contextParams(localParams[method], raw),
            );
          case "memory.archive":
            return getMemory().service.archive(
              LOCAL_WORKSPACE_ID,
              contextParams(localParams[method], raw),
            );
          case "memory.history":
            return getMemory().service.history(
              LOCAL_WORKSPACE_ID,
              contextParams(localParams[method], raw),
            );
          case "memory.delete":
            return getMemory().service.delete(
              LOCAL_WORKSPACE_ID,
              contextParams(localParams[method], raw),
            );
          case "memory.restore":
            return getMemory().service.restore(
              LOCAL_WORKSPACE_ID,
              contextParams(localParams[method], raw),
            );
          case "memory.resolve": {
            const p = contextParams(localParams[method], raw);
            return getMemory().resolve(p.selection, p.target, p.prompt);
          }
          case "host.legacy":
          case "host.authorize":
          case "host.detach":
          case "host.enable":
          case "host.info":
          case "host.refresh":
          case "host.revoked":
          case "host.session":
          case "host.terminal.settings":
          case "host.terminal.configure":
          case "approvals.local.settings":
          case "approvals.local.configure":
          case "approvals.local.list":
          case "approvals.local.get":
          case "approvals.local.decide":
          case "approvals.local.watch":
          case "observed.remote":
          case "connectors.install":
          case "connectors.status":
          case "connectors.uninstall":
            throw new LocalError(
              "DAEMON_REQUIRED",
              "Connect through the independent daemon for this method",
            );
          case "agents.local.device":
            return getAgents().localDevice(localParams[method].parse(raw).accountId);
          case "agents.local.list": {
            const p = localParams[method].parse(raw);
            return getAgents().localTasks(p.accountId, p.limit, p.before);
          }
          case "agents.local.get": {
            const p = localParams[method].parse(raw);
            return getAgents().localTask(p.accountId, p.id, p.after, p.beforeActivity);
          }
          case "agents.local.approvals":
            return getAgents().localApprovals(localParams[method].parse(raw).accountId);
          case "agents.local.execute": {
            const p = localParams[method].parse(raw);
            return getAgents().localExecute(p.accountId, p.id, p.request);
          }
          case "agents.local.clear":
            return getAgents().localClear(localParams[method].parse(raw).accountId);
          case "agents.local.detach":
            return getAgents().localDetach(localParams[method].parse(raw).accountId);
          case "agents.checkpoint": {
            const p = localParams[method].parse(raw);
            return getAgents().checkpoint(p.binding, p.sequence);
          }
          case "agents.remote": {
            const p = localParams[method].parse(raw);
            return getAgents().remote(p.binding, p.command);
          }
          case "agents.replay": {
            const p = localParams[method].parse(raw);
            return getAgents().replay(p.binding, p.after);
          }
          case "agents.snapshot": {
            const p = localParams[method].parse(raw);
            return getAgents().snapshot(p.binding, p.id, p.offset);
          }
          case "agents.capabilities":
            return getAgents().capabilities();
          case "agents.projects":
            return getAgents().projects();
          case "agents.configure": {
            const p = localParams[method].parse(raw);
            return getAgents().configure(p.rootId, p.providers);
          }
          case "agents.start": {
            const p = localParams[method].parse(raw);
            return getAgents().start(p.binding, p.commandId, p.task, p.deadline);
          }
          case "agents.command": {
            const p = localParams[method].parse(raw);
            return getAgents().command(p.binding, p.command);
          }
          case "agents.events":
            return getAgents().events(localParams[method].parse(raw).binding);
          case "agents.ack": {
            const p = localParams[method].parse(raw);
            return getAgents().ack(p.binding, p.ids);
          }
          case "agents.detach":
            return getAgents().detach(localParams[method].parse(raw).binding);
          case "runtime.info":
            return {
              version: manifest.version,
              protocolVersion: 1,
              profile: options.profile ?? "default",
              scheduler: Boolean(options.scheduler),
              runtime: Bun.version,
              // Absolute shim for commands; terminals and Agents find it on PATH.
              bun: bun.ensure() ? bun.path : null,
              features: { localTerminalApprovals: false },
            };
          case "roots.list":
            return state.roots();
          case "roots.register":
            return files.register(localParams[method].parse(raw).path);
          case "roots.remove":
            state.removeRoot(localParams[method].parse(raw).id);
            return { removed: true };
          case "files.list": {
            const p = localParams[method].parse(raw);
            return files.list(p.rootId, p.path, p.offset, p.limit);
          }
          case "files.stat": {
            const p = localParams[method].parse(raw);
            return files.stat(p.rootId, p.path);
          }
          case "files.read": {
            const p = localParams[method].parse(raw);
            return files.read(p.rootId, p.path);
          }
          case "files.write": {
            const p = localParams[method].parse(raw);
            return files.write(p.rootId, p.path, p.text, p.version);
          }
          case "files.mkdir": {
            const p = localParams[method].parse(raw);
            return files.mkdir(p.rootId, p.path);
          }
          case "files.move": {
            const p = localParams[method].parse(raw);
            return files.move(p.rootId, p.path, p.to, p.version);
          }
          case "files.delete": {
            const p = localParams[method].parse(raw);
            return files.delete(p.rootId, p.path, p.version);
          }
          case "jobs.list":
            return jobs.list();
          case "jobs.create":
            return jobs.create(localParams[method].parse(raw));
          case "jobs.update": {
            const { id, ...input } = localParams[method].parse(raw);
            return jobs.update(id, input);
          }
          case "jobs.delete":
            return jobs.delete(localParams[method].parse(raw).id);
          case "jobs.run":
            return jobs.run(localParams[method].parse(raw).id);
          case "jobs.history":
            return state
              .history(localParams[method].parse(raw).id)
              .map((run) => ({ ...run, output: run.output.slice(0, 8_192) }));
          case "tools.run": {
            const p = localParams[method].parse(raw);
            return processes.run(p, undefined, p.id);
          }
          case "tools.cancel":
            return processes.cancel(localParams[method].parse(raw).id);
          case "terminal.open": {
            const p = localParams[method].parse(raw);
            return processes.terminal(p, p.cols, p.rows);
          }
          case "terminal.input": {
            const p = localParams[method].parse(raw);
            return processes.input(p.id, p.data);
          }
          case "terminal.resize": {
            const p = localParams[method].parse(raw);
            return processes.resize(p.id, p.cols, p.rows);
          }
          case "terminal.paste": {
            const p = localParams[method].parse(raw);
            return processes.paste(p.id, p.text);
          }
          case "terminal.key": {
            const p = localParams[method].parse(raw);
            return processes.key(p.id, p.key);
          }
          case "terminal.mouse": {
            const { id, ...p } = localParams[method].parse(raw);
            return processes.mouse(id, p);
          }
          case "terminal.scroll": {
            const p = localParams[method].parse(raw);
            return processes.scroll(p.id, p.direction, p.lines);
          }
          case "terminal.close":
            return processes.cancel(localParams[method].parse(raw).id);
        }
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
      closingPromise = (async () => {
        // Stop producers and cancel execution first. File requests already
        // accepted must finish their state lookups before SQLite is closed.
        await Promise.allSettled([
          jobs.close(),
          processes.close(),
          ...(agentHost ? [agentHost.close()] : []),
        ]);
        await Promise.allSettled(pending);
        memory?.close();
        state.close();
        releaseOwner?.();
      })();
      return closingPromise;
    },
  };
}
export type LocalRuntime = ReturnType<typeof createRuntime>;
