import type { InstanceAccess } from "./instances";
import { InstanceError, instanceOrigin } from "@raypx/instances";
import { localParams, type LocalEvent, type LocalMethod } from "@raypx/contracts/local";

import type { AgentProvider } from "@raypx/core/tasks";
import type { RecordDiagnostic } from "../diagnostics";
import { createRuntime } from "./index";
import { DaemonControl } from "./daemon/control";
import { LocalTerminalControl } from "./daemon/terminal-control";
import type { HostVault } from "./daemon/vault";
import { backgroundFailure as reportBackgroundFailure } from "./background";
import { LocalError } from "./errors";

/** Shared execution, terminal and cloud ownership behind each local transport. */
export function createHost(options: {
  owner: "foreground" | "daemon";
  instanceAccess?: InstanceAccess;
  dataDir?: string;
  profile?: string;
  emit?: (event: LocalEvent) => void;
  recordDiagnostic?: RecordDiagnostic;
  agentExecutables?: Partial<Record<AgentProvider, string>>;
  vault?: HostVault;
}) {
  let control: DaemonControl | undefined;
  const backgroundFailure = reportBackgroundFailure(`${options.owner}.background`);
  const emit = (event: LocalEvent) => {
    options.emit?.(event);
    if (
      (event.event === "agent.changed" || event.event === "observed.changed") &&
      !event.data.notificationOnly
    )
      void control?.wake().catch(backgroundFailure);
  };
  let terminal: LocalTerminalControl | undefined;
  const runtime = createRuntime({
    ...options,
    mode: "daemon",
    emit,
    onInstanceRevoked: async () => {
      await Promise.allSettled([
        ...(control ? [control.close()] : []),
        ...(terminal ? [terminal.close()] : []),
      ]);
    },
  });
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
      void runtime.instanceAccess
        .assert()
        .then(() => owner.restore())
        .catch((error: unknown) => {
          if (!(error instanceof InstanceError)) backgroundFailure(error);
        });
    },
    runtime,
    control: owner,
    terminal: terminalHost,
    async request(
      method: LocalMethod,
      params: unknown,
      clientId = "stdio",
      signal?: AbortSignal,
    ): Promise<unknown> {
      if (closing) throw new LocalError("CLOSING", "Execution host is stopping");
      if (
        method !== "runtime.info" &&
        !method.startsWith("instance.") &&
        method !== "host.session" &&
        !["tools.cancel", "terminal.close"].includes(method)
      )
        await runtime.instanceAccess.assert();
      if (method === "host.session") {
        const input = localParams["host.session"].parse(params);
        const status = await runtime.instanceAccess.status();
        if (
          input.accountId &&
          status.binding &&
          (status.binding.accountId !== input.accountId ||
            status.binding.origin !== instanceOrigin(input.apiUrl))
        ) {
          await owner.request("host.session", { accountId: null, apiUrl: status.binding.origin });
          throw new InstanceError("INSTANCE_OWNER_MISMATCH");
        }
      }
      let result =
        method.startsWith("host.") || method === "observed.remote"
          ? await owner.request(method, params)
          : method.startsWith("approvals.local.") || method.startsWith("connectors.")
            ? await terminalHost.request(method, params, clientId)
            : await runtime.request(method, params, signal);
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
