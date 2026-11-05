import { serveHttp } from "@raypx/runtime-node/http";

import { MAX_RELAY_BYTES } from "@raypx/contracts/tasks";
import type { RelayHub } from "@raypx/control/relay";

export interface RelayServerOptions {
  hub: RelayHub;
  databaseReady(): Promise<unknown>;
  allowedOrigins: string[];
  hostname: string;
  port: number;
}

/** Only the transport boundary lives here; credentials arrive in the first v4 frame. */
export async function startRelayServer(options: RelayServerOptions) {
  const { hub } = options;
  let stopping = false;
  const json = (body: object, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
        "x-frame-options": "DENY",
      },
    });
  const ready = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let database = "ok";
    try {
      await Promise.race([
        Promise.resolve().then(() => options.databaseReady()),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Unavailable")), 3000);
        }),
      ]);
    } catch {
      database = "unavailable";
    } finally {
      clearTimeout(timer);
    }
    const relay = !stopping && hub.ready() ? "ok" : "unavailable";
    const ok = database === "ok" && relay === "ok";
    return json({ status: ok ? "ok" : "unavailable", checks: { database, relay } }, ok ? 200 : 503);
  };
  const server = await serveHttp<{ id: string }>({
    hostname: options.hostname,
    port: options.port,
    async fetch(request, listener) {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/health")
        return json(
          { status: stopping ? "unavailable" : "ok", service: "relay" },
          stopping ? 503 : 200,
        );
      if (request.method === "GET" && path === "/ready") return ready();
      if (request.method !== "GET" || path !== "/relay") return json({ error: "NOT_FOUND" }, 404);
      const origin = request.headers.get("origin");
      if (origin && !options.allowedOrigins.includes(origin))
        return json({ error: "FORBIDDEN" }, 403);
      if (stopping || !hub.ready()) return json({ error: "SERVICE_UNAVAILABLE" }, 503);
      if (listener.upgrade(request, { data: { id: crypto.randomUUID() } })) return;
      return json({ error: "UPGRADE_REQUIRED" }, 426);
    },
    websocket: {
      maxPayloadLength: MAX_RELAY_BYTES,
      backpressureLimit: MAX_RELAY_BYTES,
      closeOnBackpressureLimit: true,
      open(socket) {
        hub.open({
          id: socket.data.id,
          send(frame) {
            if (socket.getBufferedAmount() > MAX_RELAY_BYTES) throw new Error("Backpressure");
            if (socket.send(JSON.stringify(frame)) === 0) throw new Error("Connection closed");
          },
          close: (code, reason) => socket.close(code, reason),
        });
      },
      message(socket, value) {
        if (typeof value !== "string") {
          socket.close(4000, "Invalid frame");
          return;
        }
        void hub
          .receive(socket.data.id, value)
          .catch(() => socket.close(1013, "Relay unavailable"));
      },
      close(socket) {
        void hub.close(socket.data.id).catch(() => {});
      },
    },
  });
  let closing: Promise<void> | undefined;
  return {
    url: server.url,
    close: () =>
      (closing ??= (async () => {
        stopping = true;
        try {
          await hub.shutdown();
        } finally {
          await server.stop(true);
        }
      })()),
  };
}
