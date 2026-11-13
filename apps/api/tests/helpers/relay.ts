import { serve, sleep } from "bun";
import {
  relayServerSchema,
  type RelayClientFrame,
  type RelayServerFrame,
} from "@raypx/contracts/tasks";
import { RelayHub } from "@raypx/control/relay";
import { createApiApp } from "../../src/routers/index.js";
import { ControlService } from "@raypx/control";
import { controlAuth, memoryControlRepository } from "@raypx/control/testing";

export async function relaySocket(
  base: string,
  account: string,
  auth: Extract<RelayClientFrame, { type: "auth" }>,
) {
  const url = new URL("/relay", base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("account", account);
  const socket = new WebSocket(url),
    messages: RelayServerFrame[] = [];
  let closed: number | undefined;
  socket.addEventListener("message", (event) =>
    messages.push(relayServerSchema.parse(JSON.parse(String(event.data)))),
  );
  socket.addEventListener("close", (event) => {
    closed = event.code;
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Relay socket failed")), {
      once: true,
    });
  });
  const send = (frame: RelayClientFrame) => socket.send(JSON.stringify(frame));
  const take = async <T extends RelayServerFrame["type"]>(type: T) => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const index = messages.findIndex((frame) => frame.type === type);
      if (index >= 0) return messages.splice(index, 1)[0] as Extract<RelayServerFrame, { type: T }>;
      if (Date.now() > deadline) throw new Error(`Missing relay frame: ${type}`);
      await sleep(5);
    }
  };
  send(auth);
  return { socket, messages, send, take, closed: () => closed };
}
export async function relayFixture(allowedOrigins: string[] = []) {
  const repository = memoryControlRepository(),
    control = new ControlService(repository),
    auth = controlAuth();
  const hub = new RelayHub(async (run) => run(control));
  const app = createApiApp({
    control,
    authHandler: async () => new Response(null),
    readSession: async (headers) => (headers.get("cookie") === "fixture" ? auth : null),
    allowedOrigins,
    onRevoke: (userId, deviceId) => hub.revoke(userId, deviceId),
  });
  const peers = new Set<Bun.ServerWebSocket<{ id: string }>>();
  let relayPaused = false;
  const server = serve<{ id: string }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, listener) {
      if (new URL(request.url).pathname === "/relay") {
        if (relayPaused) return new Response(null, { status: 503 });
        if (listener.upgrade(request, { data: { id: crypto.randomUUID() } })) return;
        return new Response(null, { status: 426 });
      }
      return app.fetch(request);
    },
    websocket: {
      open(socket) {
        peers.add(socket);
        hub.open({
          id: socket.data.id,
          send: (frame) => {
            socket.send(JSON.stringify(frame));
          },
          close: (code, reason) => socket.close(code, reason),
        });
      },
      message(socket, value) {
        if (typeof value === "string") void hub.receive(socket.data.id, value);
      },
      close(socket) {
        peers.delete(socket);
        void hub.close(socket.data.id);
      },
    },
  });
  return {
    control,
    repository,
    auth,
    hub,
    base: server.url.origin,
    pauseRelay(paused: boolean) {
      relayPaused = paused;
      if (paused) for (const peer of peers) peer.close(1012, "Fixture relay outage");
    },
    close: async () => {
      await hub.shutdown();
      await server.stop(true);
    },
  };
}
