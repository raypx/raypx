import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { Readable } from "node:stream";
import { once } from "node:events";
import { WebSocketServer, type WebSocket } from "ws";
import { Agent, fetch as requestDirect } from "undici";

export interface SocketPeer<T> {
  data: T;
  send(value: string): number;
  close(code?: number, reason?: string): void;
  getBufferedAmount(): number;
}
interface SocketHandlers<T> {
  maxPayloadLength?: number;
  backpressureLimit?: number;
  closeOnBackpressureLimit?: boolean;
  open?(socket: SocketPeer<T>): void;
  message(socket: SocketPeer<T>, message: string | Uint8Array): void | Promise<void>;
  close?(socket: SocketPeer<T>, code: number, reason: string): void;
  drain?(socket: SocketPeer<T>): void;
}
export interface HttpServer<T = unknown> {
  url: URL;
  port: number;
  hostname: string;
  upgrade(request: Request, options?: { data: T }): boolean;
  stop(force?: boolean): Promise<void>;
}
interface ServerOptions<T> {
  hostname?: string;
  port?: number | string;
  unix?: string;
  idleTimeout?: number;
  maxRequestBodySize?: number;
  fetch(request: Request, server: HttpServer<T>): Response | void | Promise<Response | void>;
  websocket?: SocketHandlers<T>;
}

function requestFrom(
  incoming: IncomingMessage,
  origin: string,
  signal: AbortSignal,
  body?: Uint8Array,
) {
  const headers = new Headers();
  for (let index = 0; index < incoming.rawHeaders.length; index += 2)
    headers.append(incoming.rawHeaders[index]!, incoming.rawHeaders[index + 1]!);
  const method = incoming.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers, signal };
  if (method !== "GET" && method !== "HEAD") {
    init.body = body
      ? new Uint8Array(body)
      : (Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>);
    init.duplex = "half";
  }
  return new Request(new URL(incoming.url ?? "/", origin).href, init);
}

async function writeResponse(response: Response, outgoing: ServerResponse) {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers)
    if (name !== "set-cookie") outgoing.setHeader(name, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) outgoing.setHeader("set-cookie", cookies);
  if (!response.body) {
    outgoing.end();
    return;
  }
  const reader = response.body.getReader();
  const drain = new AbortController();
  const cancel = () => {
    drain.abort();
    void reader.cancel().catch(() => {});
  };
  outgoing.once("close", cancel);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done || outgoing.destroyed) break;
      if (!outgoing.write(value))
        await once(outgoing, "drain", { signal: drain.signal }).catch(() => {});
    }
    outgoing.end();
  } finally {
    outgoing.off("close", cancel);
    reader.releaseLock();
  }
}

/** Starts an explicitly bound listener before publishing its address. */
export async function serveHttp<T = unknown>(options: ServerOptions<T>): Promise<HttpServer<T>> {
  const upgrades = new WeakMap<
    Request,
    { request: IncomingMessage; socket: Socket; head: Buffer; accepted: boolean }
  >();
  const sockets = new Set<Socket>();
  const webSockets = options.websocket
    ? new WebSocketServer({
        noServer: true,
        maxPayload: options.websocket.maxPayloadLength ?? 1024 * 1024,
      })
    : undefined;
  let closing: Promise<void> | undefined;
  const server = createServer((incoming, outgoing) => {
    const controller = new AbortController();
    incoming.once("aborted", () => controller.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableEnded) controller.abort();
    });
    void (async () => {
      let body: Uint8Array | undefined;
      if (
        options.maxRequestBodySize !== undefined &&
        !["GET", "HEAD"].includes(incoming.method ?? "GET")
      ) {
        const limit = options.maxRequestBodySize;
        if (Number(incoming.headers["content-length"] ?? 0) > limit) {
          outgoing.writeHead(413, { connection: "close" });
          outgoing.end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
          size += chunk.length;
          if (size > limit) {
            outgoing.writeHead(413, { connection: "close" });
            outgoing.end();
            incoming.resume();
            return;
          }
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      const request = requestFrom(incoming, api.url.origin, controller.signal, body);
      const response = await options.fetch(request, api);
      await writeResponse(response ?? new Response(null, { status: 204 }), outgoing);
    })().catch(() => {
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  if (options.idleTimeout !== undefined) server.timeout = options.idleTimeout * 1000;
  const api: HttpServer<T> = {
    url: new URL("http://localhost/"),
    port: 0,
    hostname: options.hostname ?? "127.0.0.1",
    upgrade(request, optionsValue) {
      const data = optionsValue?.data as T;
      const context = upgrades.get(request);
      if (!context || !webSockets || !options.websocket || context.accepted) return false;
      context.accepted = true;
      webSockets.handleUpgrade(
        context.request,
        context.socket,
        context.head,
        (socket: WebSocket) => {
          const handlers = options.websocket!;
          const peer: SocketPeer<T> = {
            data,
            send(value) {
              if (socket.readyState !== socket.OPEN) return 0;
              if (
                socket.bufferedAmount + Buffer.byteLength(value) >
                (handlers.backpressureLimit ?? Infinity)
              ) {
                if (handlers.closeOnBackpressureLimit) socket.close(1013, "Backpressure");
                throw new Error("Backpressure");
              }
              socket.send(value, (error) => {
                if (error) socket.terminate();
                else handlers.drain?.(peer);
              });
              return Buffer.byteLength(value);
            },
            close: (code, reason) => socket.close(code, reason),
            getBufferedAmount: () => socket.bufferedAmount,
          };
          socket.on("error", () => socket.terminate());
          socket.on("message", (message, binary) => {
            const bytes = Array.isArray(message)
              ? Buffer.concat(message)
              : Buffer.from(message as ArrayBuffer);
            void Promise.resolve()
              .then(() => handlers.message(peer, binary ? bytes : bytes.toString("utf8")))
              .catch(() => socket.close(1011, "Unavailable"));
          });
          socket.on("close", (code, reason) =>
            handlers.close?.(peer, code, reason.toString("utf8")),
          );
          handlers.open?.(peer);
        },
      );
      return true;
    },
    stop(force = false) {
      return (closing ??= (async () => {
        if (webSockets) {
          for (const socket of webSockets.clients) {
            if (force) socket.terminate();
            else socket.close(1001, "Stopping");
          }
          webSockets.close();
        }
        const closed = new Promise<void>((resolveClose, reject) =>
          server.close((error) => (error ? reject(error) : resolveClose())),
        );
        if (force) {
          server.closeAllConnections();
          for (const socket of sockets) socket.destroy();
        } else server.closeIdleConnections();
        await closed;
      })());
    },
  };
  server.on("upgrade", (incoming, socket, head) => {
    const request = requestFrom(incoming, api.url.origin, new AbortController().signal);
    const context = { request: incoming, socket: socket as Socket, head, accepted: false };
    upgrades.set(request, context);
    void Promise.resolve(options.fetch(request, api))
      .then(async (response) => {
        if (context.accepted) return;
        const rejected = response ?? new Response(null, { status: 426 });
        const body = Buffer.from(await rejected.arrayBuffer());
        socket.end(
          `HTTP/1.1 ${rejected.status} Rejected\r\nConnection: close\r\nContent-Length: ${body.length}\r\n\r\n` +
            body.toString(),
        );
      })
      .catch(() => socket.destroy());
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    const ready = () => {
      server.off("error", reject);
      resolveListen();
    };
    if (options.unix) server.listen(options.unix, ready);
    else server.listen(Number(options.port ?? 0), options.hostname ?? "127.0.0.1", ready);
  });
  const address = server.address();
  if (address && typeof address !== "string") {
    api.port = address.port;
    api.url = new URL(
      `http://${api.hostname.includes(":") ? `[${api.hostname}]` : api.hostname}:${api.port}/`,
    );
  }
  return api;
}

export function directHttpClient(socketPath?: string) {
  // Bun's undici compatibility shim does not implement custom dispatchers/socketPath.
  const bun = (
    globalThis as typeof globalThis & {
      Bun?: {
        fetch(
          url: string | URL,
          init: RequestInit & { unix?: string; proxy: false },
        ): Promise<Response>;
      };
    }
  ).Bun;
  if (bun)
    return {
      fetch: (url: string | URL, init: RequestInit = {}) =>
        bun.fetch(url, { ...init, ...(socketPath ? { unix: socketPath } : {}), proxy: false }),
      close: async () => {},
    };
  const dispatcher = new Agent(socketPath ? { connect: { socketPath } } : {});
  return {
    async fetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
      return (await requestDirect(url, { ...init, dispatcher } as Parameters<
        typeof requestDirect
      >[1])) as unknown as Response;
    },
    close: () => dispatcher.close(),
  };
}
