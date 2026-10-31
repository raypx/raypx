import type { LocalEvent, LocalMethod } from "@raypx/contracts/local";

import type { AgentProvider } from "@raypx/core/tasks";
import type { RecordDiagnostic } from "../diagnostics";
import { createRuntime } from "./index";
import { DaemonControl } from "./daemon/control";
import { LocalTerminalControl } from "./daemon/terminal-control";
import type { HostVault } from "./daemon/vault";
import { LocalError } from "./errors";

/** Shared execution, terminal and cloud ownership behind each local transport. */
export function createHost(options: {
  owner: "foreground" | "daemon";
  dataDir?: string;
  profile?: string;
  emit?: (event: LocalEvent) => void;
  recordDiagnostic?: RecordDiagnostic;
  agentExecutables?: Partial<Record<AgentProvider, string>>;
  vault?: HostVault;
}) {
  let control: DaemonControl | undefined;
  const backgroundFailure = () =>
    console.error(
      JSON.stringify({ operation: `${options.owner}.background`, code: "BACKGROUND_FAILED" }),
    );
  const emit = (event: LocalEvent) => {
    options.emit?.(event);
    if (
      (event.event === "agent.changed" || event.event === "observed.changed") &&
      !event.data.notificationOnly
    )
      void control?.wake().catch(backgroundFailure);
  };
  const runtime = createRuntime({ ...options, scheduler: true, exclusiveOwner: true, emit });
  let terminal: LocalTerminalControl | undefined;
  try {
    terminal = new LocalTerminalControl(runtime.state.directory, runtime, emit);
    control = new DaemonControl(
      runtime.state.directory,
      runtime,
      emit,
      terminal,
      options.vault,
      options.owner === "daemon",
    );
  } catch (error) {
    void (async () => {
      try {
        await terminal?.close();
      } finally {
        await runtime.close();
      }
    })().catch(backgroundFailure);
    throw error;
  }
  const owner = control;
  const terminalHost = terminal;
  let closing: Promise<void> | undefined;
  return {
    restore() {
      void owner.restore().catch(backgroundFailure);
    },
    runtime,
    control: owner,
    terminal: terminalHost,
    async request(method: LocalMethod, params: unknown, clientId = "stdio"): Promise<unknown> {
      if (closing) throw new LocalError("CLOSING", "Execution host is stopping");
      let result =
        method.startsWith("host.") || method === "observed.remote"
          ? await owner.request(method, params)
          : method.startsWith("approvals.local.") || method.startsWith("connectors.")
            ? await terminalHost.request(method, params, clientId)
            : await runtime.request(method, params);
      if (method === "runtime.info")
        result = {
          ...(result as Record<string, unknown>),
          owner: options.owner,
          hostProtocol: 1,
          features: { localTerminalApprovals: terminalHost.supported },
        };
      if (method === "agents.configure" || method === "roots.remove")
        terminalHost.projectsChanged();
      return result;
    },
    close() {
      return (closing ??= (async () => {
        try {
          await owner.close();
        } finally {
          try {
            await terminalHost.close();
          } finally {
            await runtime.close();
          }
        }
      })());
    },
  };
}
