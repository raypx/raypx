import { localParams, LOCAL_WORKSPACE_ID, type LocalMethod } from "@raypx/contracts/local";
import { ContextError } from "@raypx/core/memory";
import type { InstanceRuntime, InstanceAccess } from "./instances";
import type { MemoryRuntime } from "./memory";
import type { AgentRuntime } from "./agents";
import type { FileRuntime } from "./files";
import type { JobRuntime } from "./jobs";
import type { ProcessRuntime } from "./process";
import type { BundledBun } from "./process/bun";
import type { StateStore } from "./state";
import type { PiHost } from "./agents/pi/host";
import { LocalError } from "./errors";
import manifest from "../../package.json";
import { cliBuild } from "./daemon/build";
const contextParams = <T>(schema: { parse(input: unknown): T }, input: unknown): T => {
  try {
    return schema.parse(input);
  } catch {
    throw new ContextError("INVALID_CONTEXT");
  }
};

export function createLocalRouter({
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
  options,
}: {
  instances: InstanceRuntime;
  instanceAccess: InstanceAccess;
  getAgents: () => AgentRuntime;
  getMemory: () => MemoryRuntime;
  files: FileRuntime;
  jobs: JobRuntime;
  processes: ProcessRuntime;
  state: StateStore;
  pi: PiHost;
  bun: BundledBun;
  refreshInstance: () => ReturnType<InstanceRuntime["refresh"]>;
  options: { profile?: string; scheduler?: boolean };
}) {
  return async (method: LocalMethod, raw: unknown, signal?: AbortSignal): Promise<unknown> => {
    // Narrow each schema independently to preserve method-specific types.
    if (
      method !== "runtime.info" &&
      !method.startsWith("instance.") &&
      !["tools.cancel", "terminal.close"].includes(method)
    )
      await instanceAccess.assert();
    switch (method) {
      case "instance.status":
        localParams[method].parse(raw);
        return instanceAccess.status();
      case "instance.begin":
        return instances.begin(localParams[method].parse(raw).origin);
      case "instance.poll":
        localParams[method].parse(raw);
        return instances.poll();
      case "instance.refresh":
        localParams[method].parse(raw);
        return refreshInstance();
      case "memory.list":
        contextParams(localParams[method], raw);
        return getMemory().service.list(LOCAL_WORKSPACE_ID);
      case "memory.get":
        return getMemory().service.get(LOCAL_WORKSPACE_ID, contextParams(localParams[method], raw));
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
        return getAgents().localTasks(p.accountId, p.limit, p.before, p.projectId, p.deviceId);
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
      case "agents.models.list":
        localParams[method].parse(raw);
        return pi.models.list();
      case "agents.models.default":
        localParams[method].parse(raw);
        return { default: pi.models.default() };
      case "agents.models.setDefault":
        return pi.models.setDefault(localParams[method].parse(raw).model);
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
        bun.ensure();
        return {
          version: manifest.version,
          builtAt: cliBuild.builtAt,
          protocolVersion: 1,
          profile: options.profile ?? "default",
          scheduler: Boolean(options.scheduler),
          runtime: Bun.version,
          // Embedded Bun runtime and shims; project tools still use the user environment.
          bun: bun.path,
          bunx: bun.path.replace(
            /bun(?:\.cmd)?$/,
            process.platform === "win32" ? "bunx.cmd" : "bunx",
          ),
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
        return jobs
          .history(localParams[method].parse(raw).id)
          .map((run) => ({ ...run, output: run.output.slice(0, 8_192) }));
      case "tools.run": {
        const p = localParams[method].parse(raw);
        return processes.run(p, signal, p.id);
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
  };
}
