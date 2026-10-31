import { join } from "node:path";
import type { LocalMethod } from "@raypx/contracts/local";

import type { AgentProvider } from "@raypx/core/tasks";
import type {
  ObservedProjection,
  TerminalDecision,
  TerminalRequest,
} from "@raypx/contracts/terminal";
import { startDaemon } from "../../src/runtime/daemon/server";
import { daemonFetch } from "../../src/runtime/daemon/endpoint";
import { readTerminalEndpoint, startTerminalHost } from "../../src/runtime/terminal/host";
import { daemonEventLines } from "../../src/transport/daemon-stdio";

/** Explicit live gate only: exercise the same authenticated IPC and profile broker as Native. */
export async function terminalSmokeHost(
  directory: string,
  project: string,
  provider: AgentProvider,
  away: boolean,
  waitSeconds: number,
  changed: (request: TerminalRequest) => void,
) {
  if (process.env.RAYPX_P0_HOST_MODE !== "daemon") {
    const host = startTerminalHost({
      profileDirectory: directory,
      directory,
      projects: [project],
      away,
      waitSeconds,
      changed,
    });
    return {
      discoveryDirectory: directory,
      watch: async () => {
        const { terminalFetch } = await import("../../src/runtime/terminal/host");
        await terminalFetch(host.endpoint, "owner", "/watch", { active: true });
      },
      list: async () => host.broker.list(),
      decide: async (decision: TerminalDecision) => host.broker.decide(decision),
      close: () => host.close(),
    };
  }
  const daemon = await startDaemon({ dataDir: directory });
  const client = crypto.randomUUID(),
    abort = new AbortController();
  const request = async <T>(method: LocalMethod, params: unknown): Promise<T> => {
    const response = await daemonFetch(
      daemon.endpoint,
      `/rpc?client=${client}`,
      { version: 1, id: crypto.randomUUID(), method, params },
      abort.signal,
    );
    const value = (await response.json()) as { result: T; error?: { code: string } };
    if (!response.ok || value.error) throw new Error(value.error?.code ?? "HOST_UNAVAILABLE");
    return value.result;
  };
  let events: Promise<void> | undefined;
  try {
    const stream = await daemonFetch(
      daemon.endpoint,
      `/events?client=${client}`,
      undefined,
      abort.signal,
    );
    if (!stream.ok || !stream.body) throw new Error("Host event subscription failed");
    events = (async () => {
      try {
        for await (const line of daemonEventLines(stream.body!)) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.event === "observed.changed" && typeof event.data.pendingRequest === "string")
            changed(
              await request<TerminalRequest>("approvals.local.get", {
                id: event.data.pendingRequest,
              }),
            );
        }
      } catch {
        if (!abort.signal.aborted) throw new Error("Host event stream failed");
      }
    })();
    void events.catch(() => {});
    const root = await request<{ id: string }>("roots.register", { path: project });
    await request("agents.configure", { rootId: root.id, providers: [provider] });
    await request("approvals.local.configure", { rootIds: [root.id], away, waitSeconds });
    const discoveryDirectory = daemon.runtime.state.directory;
    readTerminalEndpoint(join(discoveryDirectory, "terminal"));
    return {
      discoveryDirectory,
      watch: () => request("approvals.local.watch", { active: true }),
      list: async () => {
        const projection = await request<ObservedProjection>("approvals.local.list", {});
        return Promise.all(
          projection.requests.map((summary) =>
            request<TerminalRequest>("approvals.local.get", { id: summary.id }),
          ),
        );
      },
      decide: (decision: TerminalDecision) =>
        request<TerminalRequest>("approvals.local.decide", { decision }),
      close: async () => {
        abort.abort();
        await events?.catch(() => {});
        await daemon.close();
      },
    };
  } catch (error) {
    abort.abort();
    await events?.catch(() => {});
    await daemon.close();
    throw error;
  }
}
