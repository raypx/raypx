import { cliInstallation } from "../process/installation.js";
import { runtimeLease } from "../process/lease.js";
import type { InstanceAccess } from "../instances/index.js";
import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localParams, localRequestSchema, type LocalEvent } from "@raypx/contracts/local";
import { createExecutionOwner, type ExecutionHost } from "../owner.js";
import { onShutdown } from "../../transport/shutdown.js";
import type { LocalRuntime } from "../index.js";
import { acquireLock, profilePath } from "../state/index.js";
import { backgroundFailure as reportBackgroundFailure } from "../background.js";
import { errorPayload, LocalError } from "../errors.js";
import { endpointFile, readDaemon, type DaemonEndpoint, type ProfileOptions } from "./endpoint.js";
import type { DaemonControl } from "./control.js";
import type { LocalTerminalControl } from "./terminal-control.js";
import type { HostVault } from "./vault.js";
import manifest from "../../../package.json";

import type { AgentProvider } from "@raypx/core/tasks";
import { cliBuild } from "./build.js";
import { refreshStableCli } from "./connectors.js";
import { privateSocketDirectory } from "../terminal/socket.js";
import { foreignLoopbackRequest, loopbackTransport, type LocalAddress } from "../local-http.js";
import { DesktopGateway } from "./desktop/gateway.js";
import { loadRoutineIngress, startRoutineIngress } from "../jobs/ingress.js";

type Client = {
  stream: ReadableStreamDefaultController<Uint8Array>;
  children: Set<string>;
  pending: number;
  abort: AbortController;
};
export async function startDaemon(
  options: ProfileOptions & {
    vault?: HostVault;
    instanceAccess?: InstanceAccess;
    agentExecutables?: Partial<Record<AgentProvider, string>>;
  } = {},
) {
  const settings = loadRoutineIngress();
  const routineIngress =
    settings?.profile === (options.profile ?? "default") ? settings : undefined;
  const directory = profilePath(options);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const unlock = acquireLock(directory, "daemon-owner");
  if (!unlock) throw new LocalError("HOST_RUNNING", "A daemon already owns this profile");
  const loopback = loopbackTransport();
  let previous: string | undefined;
  try {
    previous = readDaemon(directory).socket;
  } catch {
    /* First startup. */
  }
  const socketDirectory = loopback
    ? undefined
    : privateSocketDirectory(directory, "host", previous);
  const identity = {
    protocol: 1 as const,
    version: manifest.version,
    builtAt: cliBuild.builtAt,
    epoch: crypto.randomUUID(),
    token: crypto.randomUUID() + crypto.randomUUID(),
  };
  // A loopback port is known only after binding; the endpoint is published afterwards.
  let address: LocalAddress = socketDirectory
    ? { socket: join(socketDirectory, "host.sock") }
    : { port: 1 };
  let endpoint: DaemonEndpoint = { ...identity, ...address };
  const clients = new Map<string, Client>(),
    encoder = new TextEncoder();
  let host: ExecutionHost | undefined;
  let desktop: DesktopGateway | undefined;
  let terminal: LocalTerminalControl | undefined;
  let runtime: LocalRuntime | undefined,
    control: DaemonControl | undefined,
    server: ReturnType<typeof Bun.serve> | undefined;
  let ingress: ReturnType<typeof startRoutineIngress> | undefined;
  let stopping = false;
  const backgroundFailure = reportBackgroundFailure("daemon.background");
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closing: Promise<void> | undefined,
    resolveStopped = () => {};
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  const releaseClient = (id: string, expected = clients.get(id)) => {
    const client = clients.get(id);
    if (!client || client !== expected) return;
    clients.delete(id);
    client?.abort.abort();
    terminal?.releaseClient(id);
    for (const child of client?.children ?? []) runtime?.processes.cancel(child);
    try {
      client?.stream.close();
    } catch {
      /* Already disconnected. */
    }
  };
  const emit = (event: LocalEvent) => {
    const encoded = JSON.stringify(event);
    desktop?.emit(event, encoded);
    if (
      (event.event === "terminal.exit" || event.event === "tool.finished") &&
      typeof event.data.id === "string"
    )
      for (const client of clients.values()) client.children.delete(event.data.id);
    const bytes = encoder.encode(encoded + "\n");
    for (const [id, client] of clients) {
      if ((client.stream.desiredSize ?? 0) < 0) {
        releaseClient(id);
        continue;
      }
      try {
        client.stream.enqueue(bytes);
      } catch {
        releaseClient(id);
      }
    }
  };
  const close = () => {
    stopping = true;
    clearInterval(heartbeat);
    return (closing ??= (async () => {
      try {
        for (const id of clients.keys()) releaseClient(id);
        try {
          try {
            await ingress?.stop(true);
          } finally {
            await desktop?.close();
          }
        } finally {
          await host?.close();
        }
      } finally {
        try {
          await server?.stop(true);
        } finally {
          try {
            if (readDaemon(directory).epoch === endpoint.epoch)
              rmSync(endpointFile(directory), { force: true });
          } catch {
            /* Not our metadata. */
          }
          if (socketDirectory) rmSync(socketDirectory, { recursive: true, force: true });
          unlock();
          resolveStopped();
        }
      }
    })());
  };
  try {
    refreshStableCli();
    host = createExecutionOwner({ ...options, mode: "daemon", emit, routineIngress });
    ({ runtime, terminal, control } = host);
    desktop = new DesktopGateway(host, directory);
    server = Bun.serve({
      ...(address.socket === undefined
        ? { hostname: "127.0.0.1", port: 0 }
        : { unix: address.socket }),
      maxRequestBodySize: 8 * 1024 * 1024,
      fetch: async (request, transport) => {
        transport.timeout(request, 0);
        if (foreignLoopbackRequest(request, address)) return new Response(null, { status: 403 });
        const url = new URL(request.url);
        if (url.pathname === "/desktop/native" && request.method === "POST" && !stopping) {
          const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
          if (!desktop!.permitsNative(token)) return new Response(null, { status: 403 });
          try {
            if (Number(request.headers.get("content-length")) > 64 * 1024)
              return new Response(null, { status: 413 });
            const body = await request.text();
            if (Buffer.byteLength(body) > 64 * 1024) return new Response(null, { status: 413 });
            return Response.json({
              result: await desktop!.native(token, JSON.parse(body), request.signal),
            });
          } catch (error) {
            // A refusal means the capability is gone and the host must bootstrap again.
            // An operation that failed still reached its owner: report its code as data.
            if (!desktop!.permitsNative(token)) return new Response(null, { status: 403 });
            return Response.json({ error: { code: errorPayload(error).code } });
          }
        }
        if (request.headers.get("authorization") !== `Bearer ${endpoint.token}`)
          return new Response(null, { status: 403 });
        if (url.pathname === "/info" && request.method === "GET")
          return Response.json({
            protocol: 1,
            version: manifest.version,
            builtAt: cliBuild.builtAt,
            epoch: endpoint.epoch,
            owner: "daemon",
            pid: process.pid,
            closing: stopping,
          });
        if (url.pathname === "/stop" && request.method === "POST") {
          stopping = true;
          setTimeout(() => {
            void close().catch(backgroundFailure);
          }, 25);
          return Response.json({ stopped: true });
        }
        if (stopping) return new Response(null, { status: 503 });
        if (url.pathname === "/desktop" && request.method === "POST") {
          try {
            const body = await request.text();
            if (Buffer.byteLength(body) > 64 * 1024) return new Response(null, { status: 413 });
            const result = await desktop!.administrative(JSON.parse(body));
            return Response.json({ result: { ...result, nativeAddress: address } });
          } catch (error) {
            return Response.json({ error: { code: errorPayload(error).code } });
          }
        }
        const id = url.searchParams.get("client");
        if (!id || !/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 400 });
        if (url.pathname === "/events" && request.method === "GET") {
          if (clients.has(id) || clients.size >= 32) return new Response(null, { status: 409 });
          let client: Client;
          const stream = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                client = {
                  stream: controller,
                  children: new Set(),
                  pending: 0,
                  abort: new AbortController(),
                };
                clients.set(id, client);
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      version: 1,
                      event: "engine.status",
                      data: { status: "ready", owner: "daemon" },
                    }) + "\n",
                  ),
                );
              },
              cancel() {
                releaseClient(id, client);
              },
            },
            { highWaterMark: 16 * 1024 * 1024, size: (chunk) => chunk?.byteLength ?? 0 },
          );
          request.signal.addEventListener("abort", () => releaseClient(id, client), { once: true });
          return new Response(stream, {
            headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
          });
        }
        const client = clients.get(id);
        if (!client || url.pathname !== "/rpc" || request.method !== "POST")
          return new Response(null, { status: 404 });
        let requestId = "invalid";
        if (client.pending >= 64) return new Response(null, { status: 429 });
        client.pending++;
        let toolId: string | undefined;
        try {
          const input = localRequestSchema.parse(await request.json());
          requestId = input.id;
          if (input.method === "tools.run") {
            const params = localParams["tools.run"].parse(input.params);
            toolId = params.id ?? crypto.randomUUID();
            client.children.add(toolId);
            const result = await host!.request(
              input.method,
              { ...params, id: toolId },
              id,
              client.abort.signal,
            );
            return Response.json({ version: 1, id: requestId, result });
          }
          const result = await host!.request(input.method, input.params, id, client.abort.signal);
          if (
            input.method === "terminal.open" &&
            result &&
            typeof result === "object" &&
            "id" in result &&
            typeof result.id === "string"
          ) {
            if (clients.get(id) === client) client.children.add(result.id);
            else runtime!.processes.cancel(result.id);
          }
          return Response.json({ version: 1, id: requestId, result: result ?? null });
        } catch (error) {
          return Response.json({ version: 1, id: requestId, error: errorPayload(error) });
        } finally {
          if (toolId) client.children.delete(toolId);
          client.pending--;
        }
      },
    });
    // Keep idle event transports alive without granting or renewing approval leases.
    heartbeat = setInterval(() => {
      for (const [id, client] of clients) {
        if ((client.stream.desiredSize ?? 0) < 0) {
          releaseClient(id);
          continue;
        }
        try {
          client.stream.enqueue(encoder.encode("\n"));
        } catch {
          releaseClient(id);
        }
      }
    }, 5000);
    heartbeat.unref();
    if (address.socket === undefined) {
      address = { port: server.port! };
      endpoint = { ...identity, ...address };
    } else chmodSync(address.socket, 0o600);
    const file = endpointFile(directory),
      temporary = `${file}.${endpoint.epoch}.tmp`;
    writeFileSync(temporary, JSON.stringify(endpoint), { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
    if (routineIngress) {
      const jobs = runtime.jobs;
      const state = runtime.state;
      ingress = startRoutineIngress(
        routineIngress,
        (id, trigger) => state.webhookKey(id, trigger),
        (id, delivery) => jobs.deliver(id, delivery),
      );
    }
    host.restore();
    return { endpoint, runtime, control, terminal, emit, close, stopped };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function runDaemon(options: ProfileOptions) {
  const rejected = () =>
    console.error(JSON.stringify({ operation: "daemon.background", code: "UNHANDLED_REJECTION" }));
  process.on("unhandledRejection", rejected);
  let releaseRuntime: (() => void) | undefined;
  let removeSignals: (() => void) | undefined;
  try {
    const layout = cliInstallation();
    if (process.platform === "win32" && layout.bundled) {
      releaseRuntime = runtimeLease(layout.root);
      if (!releaseRuntime) throw new LocalError("HOST_STOPPING", "Runtime cleanup is in progress");
    }
    const host = await startDaemon(options);
    const stop = () => {
      void host.close().catch(rejected);
    };
    removeSignals = onShutdown(stop);
    await host.stopped;
  } finally {
    removeSignals?.();
    releaseRuntime?.();
    process.off("unhandledRejection", rejected);
  }
}
