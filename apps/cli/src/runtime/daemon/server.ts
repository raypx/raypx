import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localParams, localRequestSchema, type LocalEvent } from "@raypx/contracts/local";
import { createRuntime, type LocalRuntime } from "../index";
import { acquireLock, profilePath } from "../state";
import { errorPayload, LocalError } from "../errors";
import { endpointFile, readDaemon, type DaemonEndpoint, type ProfileOptions } from "./endpoint";
import { DaemonControl } from "./control";
import type { HostVault } from "./vault";
import manifest from "../../../package.json";
import type { AgentProvider } from "@raypx/contracts/tasks";
import { privateSocketDirectory } from "../terminal/socket";

type Client = {
  stream: ReadableStreamDefaultController<Uint8Array>;
  children: Set<string>;
  pending: number;
  abort: AbortController;
};
export async function startDaemon(
  options: ProfileOptions & {
    vault?: HostVault;
    agentExecutables?: Partial<Record<AgentProvider, string>>;
  } = {},
) {
  if (process.platform === "win32")
    throw new LocalError("UNSUPPORTED_PLATFORM", "Daemon requires a Unix socket");
  const directory = profilePath(options);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const unlock = acquireLock(directory, "daemon-owner");
  if (!unlock) throw new LocalError("HOST_RUNNING", "A daemon already owns this profile");
  let previous: string | undefined;
  try {
    previous = readDaemon(directory).socket;
  } catch {
    /* First startup. */
  }
  const socketDirectory = privateSocketDirectory(directory, "host", previous);
  const endpoint: DaemonEndpoint = {
    protocol: 1,
    version: manifest.version,
    epoch: crypto.randomUUID(),
    socket: join(socketDirectory, "host.sock"),
    token: crypto.randomUUID() + crypto.randomUUID(),
  };
  const clients = new Map<string, Client>(),
    encoder = new TextEncoder();
  let runtime: LocalRuntime | undefined,
    control: DaemonControl | undefined,
    server: ReturnType<typeof Bun.serve> | undefined;
  let closing: Promise<void> | undefined,
    resolveStopped = () => {};
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  const releaseClient = (id: string) => {
    const client = clients.get(id);
    clients.delete(id);
    client?.abort.abort();
    for (const child of client?.children ?? []) runtime?.processes.cancel(child);
    try {
      client?.stream.close();
    } catch {
      /* Already disconnected. */
    }
  };
  const emit = (event: LocalEvent) => {
    if (
      (event.event === "terminal.exit" || event.event === "tool.finished") &&
      typeof event.data.id === "string"
    )
      for (const client of clients.values()) client.children.delete(event.data.id);
    const bytes = encoder.encode(JSON.stringify(event) + "\n");
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
    if (
      (event.event === "agent.changed" || event.event === "observed.changed") &&
      !event.data.notificationOnly
    )
      void control?.wake();
  };
  const close = () =>
    (closing ??= (async () => {
      try {
        for (const id of clients.keys()) releaseClient(id);
        try {
          await control?.close();
        } finally {
          try {
            await runtime?.close();
          } finally {
            await server?.stop(true);
          }
        }
      } finally {
        try {
          if (readDaemon(directory).epoch === endpoint.epoch)
            rmSync(endpointFile(directory), { force: true });
        } catch {
          /* Not our metadata. */
        }
        rmSync(socketDirectory, { recursive: true, force: true });
        unlock();
        resolveStopped();
      }
    })());
  try {
    runtime = createRuntime({ ...options, scheduler: true, exclusiveOwner: true, emit });
    control = new DaemonControl(directory, runtime, emit, options.vault);
    server = Bun.serve({
      unix: endpoint.socket,
      maxRequestBodySize: 8 * 1024 * 1024,
      fetch: async (request, transport) => {
        transport.timeout(request, 0);
        if (request.headers.get("authorization") !== `Bearer ${endpoint.token}`)
          return new Response(null, { status: 403 });
        const url = new URL(request.url);
        if (url.pathname === "/info" && request.method === "GET")
          return Response.json({
            protocol: 1,
            version: manifest.version,
            epoch: endpoint.epoch,
            owner: "daemon",
          });
        if (url.pathname === "/stop" && request.method === "POST") {
          setTimeout(() => {
            void close();
          }, 25);
          return Response.json({ stopped: true });
        }
        const id = url.searchParams.get("client");
        if (!id || !/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 400 });
        if (url.pathname === "/events" && request.method === "GET") {
          if (clients.has(id) || clients.size >= 32) return new Response(null, { status: 409 });
          const stream = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                clients.set(id, {
                  stream: controller,
                  children: new Set(),
                  pending: 0,
                  abort: new AbortController(),
                });
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
                releaseClient(id);
              },
            },
            { highWaterMark: 16 * 1024 * 1024, size: (chunk) => chunk?.byteLength ?? 0 },
          );
          request.signal.addEventListener("abort", () => releaseClient(id), { once: true });
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
            const result = await runtime!.processes.run(params, client.abort.signal, toolId);
            return Response.json({ version: 1, id: requestId, result });
          }
          let result =
            input.method.startsWith("host.") ||
            input.method.startsWith("observed.") ||
            input.method.startsWith("connectors.")
              ? await control!.request(input.method, input.params)
              : await runtime!.request(input.method, input.params);
          if (input.method === "runtime.info")
            result = { ...(result as Record<string, unknown>), owner: "daemon", hostProtocol: 1 };
          if (input.method === "agents.configure" || input.method === "roots.remove")
            await control!.projectsChanged();
          if (
            input.method === "terminal.open" &&
            result &&
            typeof result === "object" &&
            "id" in result &&
            typeof result.id === "string"
          ) {
            if (clients.has(id)) client.children.add(result.id);
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
    chmodSync(endpoint.socket, 0o600);
    const file = endpointFile(directory),
      temporary = `${file}.${endpoint.epoch}.tmp`;
    writeFileSync(temporary, JSON.stringify(endpoint), { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
    await control.restore();
    return { endpoint, runtime, control, emit, close, stopped };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function runDaemon(options: ProfileOptions) {
  const host = await startDaemon(options),
    stop = () => {
      void host.close();
    };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await host.stopped;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
