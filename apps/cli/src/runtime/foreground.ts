import type { LocalEvent, LocalMethod } from "@raypx/contracts/local";
import type { AgentProvider } from "@raypx/contracts/tasks";
import type { RecordDiagnostic } from "../diagnostics";
import { createRuntime } from "./index";
import { DaemonControl } from "./daemon/control";
import { LocalTerminalControl } from "./daemon/terminal-control";
import type { HostVault } from "./daemon/vault";
import { LocalError } from "./errors";

/** Windows' stdio process owns execution and credentials until EOF or Quit. */
export function createForegroundHost(options: {
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
      JSON.stringify({ operation: "foreground.background", code: "BACKGROUND_FAILED" }),
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
  let terminal: LocalTerminalControl;
  try {
    terminal = new LocalTerminalControl(runtime.state.directory, runtime, emit);
    control = new DaemonControl(
      runtime.state.directory,
      runtime,
      emit,
      terminal,
      options.vault,
      false,
    );
  } catch (error) {
    void runtime.close();
    throw error;
  }
  const owner = control;
  let closing: Promise<void> | undefined;
  void owner.restore().catch(backgroundFailure);
  return {
    runtime,
    control: owner,
    terminal,
    async request(method: LocalMethod, params: unknown): Promise<unknown> {
      if (closing) throw new LocalError("CLOSING", "Foreground host is stopping");
      let result =
        method.startsWith("host.") || method === "observed.remote"
          ? await owner.request(method, params)
          : method.startsWith("approvals.local.") || method.startsWith("connectors.")
            ? await terminal.request(method, params, "stdio")
            : await runtime.request(method, params);
      if (method === "runtime.info")
        result = {
          ...(result as Record<string, unknown>),
          owner: "foreground",
          hostProtocol: 1,
          features: { localTerminalApprovals: terminal.supported },
        };
      if (method === "agents.configure" || method === "roots.remove") terminal.projectsChanged();
      return result;
    },
    close() {
      return (closing ??= (async () => {
        try {
          await owner.close();
        } finally {
          try {
            await terminal.close();
          } finally {
            await runtime.close();
          }
        }
      })());
    },
  };
}
