import { expect, it, vi } from "vite-plus/test";
import { RelayConnection } from "../src/relay.js";
import { deferred, ManualScheduler, RelaySocket } from "./helpers/relay.js";

it("drives retry backoff, heartbeat expiry and stop entirely through its scheduler", async () => {
  const scheduler = new ManualScheduler(),
    sockets: RelaySocket[] = [],
    status = vi.fn();
  const connection = new RelayConnection({
    url: "wss://relay.example.test/relay",
    scheduler,
    status,
    message: () => {},
    authenticate: async () => ({
      type: "auth",
      role: "viewer",
      protocolVersion: 3,
      token: "synthetic-ticket",
    }),
    socket: () => {
      const socket = new RelaySocket();
      sockets.push(socket);
      return socket.asWebSocket();
    },
  });
  connection.start();
  for (const delay of [400, 800, 1600]) {
    const socket = sockets.at(-1)!;
    socket.open();
    await socket.sent((frame) => frame.type === "auth");
    socket.close(1012);
    expect(scheduler.nextDelay).toBe(delay);
    const count = sockets.length;
    scheduler.advance(delay - 1);
    expect(sockets).toHaveLength(count);
    scheduler.advance(1);
    expect(sockets).toHaveLength(count + 1);
  }
  const socket = sockets.at(-1)!;
  socket.open();
  await socket.sent((frame) => frame.type === "auth");
  socket.receive({ type: "ready", role: "viewer", protocolVersion: 3 });
  scheduler.advance(45_000);
  expect(socket.frames.filter((frame) => frame.type === "ping")).toHaveLength(3);
  scheduler.advance(15_000);
  expect(await socket.closed.promise).toBe(4000);
  expect(scheduler.nextDelay).toBe(3200);
  connection.stop();
  expect(scheduler.pending).toBe(0);
  scheduler.advance(100_000);
  expect(sockets).toHaveLength(4);
  expect(status).toHaveBeenLastCalledWith(false, "NETWORK_UNAVAILABLE");
});

it("fences authentication that resolves after stop and resets backoff after live traffic", async () => {
  const scheduler = new ManualScheduler(),
    auth = deferred<{ type: "auth"; role: "viewer"; protocolVersion: 3; token: string }>();
  const sockets: RelaySocket[] = [];
  const connection = new RelayConnection({
    url: "wss://relay.example.test/relay",
    scheduler,
    status: () => {},
    message: () => {},
    authenticate: () => auth.promise,
    socket: () => {
      const socket = new RelaySocket();
      sockets.push(socket);
      return socket.asWebSocket();
    },
  });
  connection.start();
  sockets[0]!.open();
  connection.stop();
  auth.resolve({ type: "auth", role: "viewer", protocolVersion: 3, token: "synthetic-ticket" });
  await auth.promise;
  expect(sockets[0]!.frames).toEqual([]);
  connection.start();
  sockets[1]!.open();
  await sockets[1]!.sent((frame) => frame.type === "auth");
  sockets[1]!.close(1012);
  scheduler.advance(400);
  sockets[2]!.open();
  await sockets[2]!.sent((frame) => frame.type === "auth");
  sockets[2]!.receive({ type: "ready", role: "viewer", protocolVersion: 3 });
  sockets[2]!.receive({ type: "pong" });
  sockets[2]!.close(1012);
  expect(scheduler.nextDelay).toBe(400);
  connection.stop();
  expect(scheduler.pending).toBe(0);
});
