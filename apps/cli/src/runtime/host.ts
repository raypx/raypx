import type { InstanceAccess } from "./instances/index.js";
import { InstanceError, instanceOrigin } from "@raypx/instances";
import { localParams, type LocalEvent, type LocalMethod } from "@raypx/contracts/local";

import type { AgentProvider } from "@raypx/core/tasks";
import type { RecordDiagnostic } from "../diagnostics.js";
import { createRuntime } from "./index.js";
import { DaemonControl } from "./daemon/control.js";
import { LocalTerminalControl } from "./daemon/terminal-control.js";
import type { HostVault } from "./daemon/vault.js";
import { backgroundFailure as reportBackgroundFailure } from "./background.js";
import { LocalError } from "./errors.js";

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
      signal?.throwIfAborted();
      if (
        method !== "runtime.info" &&
        !method.startsWith("instance.") &&
        method !== "host.session" &&
        !["tools.cancel", "terminal.close"].includes(method)
      )
        await runtime.instanceAccess.assert();
      signal?.throwIfAborted();
      if (method === "host.session") {
        const input = localParams["host.session"].parse(params);
        const status = await runtime.instanceAccess.status();
        signal?.throwIfAborted();
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
