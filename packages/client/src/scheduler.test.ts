import { deferred, ManualScheduler, RelaySocket } from "@raypx/testing";
import { expect, it, vi } from "vitest";
import { RelayConnection } from "./relay.js";

it.each([undefined, 1, 2, 3, "4", 5])(
  "rejects server protocol %s without retrying or accepting application frames",
  async (protocolVersion) => {
    const scheduler = new ManualScheduler(),
      socket = new RelaySocket(),
      status = vi.fn(),
      message = vi.fn();
    const connection = new RelayConnection({
      url: "wss://relay.example.test/relay",
      scheduler,
      status,
      message,
      authenticate: async () => ({
        type: "auth",
        role: "viewer",
        protocolVersion: 4,
        token: "synthetic-ticket",
      }),
      socket: () => socket.asWebSocket(),
    });
    try {
      connection.start();
      socket.open();
      await socket.sent((frame) => frame.type === "auth");
      socket.receive({ type: "ready", role: "viewer", protocolVersion });
      expect(await socket.closed.promise).toBe(4006);
      expect(status).toHaveBeenLastCalledWith(false, "UPGRADE_REQUIRED", expect.any(AbortSignal));
      expect(message).not.toHaveBeenCalled();
      expect(scheduler.pending).toBe(0);
    } finally {
      connection.stop();
    }
  },
);

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
      protocolVersion: 4,
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
  socket.receive({ type: "ready", role: "viewer", protocolVersion: 4 });
  scheduler.advance(45_000);
  expect(socket.frames.filter((frame) => frame.type === "ping")).toHaveLength(3);
  scheduler.advance(15_000);
  expect(await socket.closed.promise).toBe(4000);
  expect(scheduler.nextDelay).toBe(3200);
  connection.stop();
  expect(scheduler.pending).toBe(0);
  scheduler.advance(100_000);
  expect(sockets).toHaveLength(4);
  expect(status).toHaveBeenLastCalledWith(false, "NETWORK_UNAVAILABLE", expect.any(AbortSignal));
});

it("fences authentication that resolves after stop and resets backoff after live traffic", async () => {
  const scheduler = new ManualScheduler(),
    auth = deferred<{ type: "auth"; role: "viewer"; protocolVersion: 4; token: string }>();
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
  auth.resolve({ type: "auth", role: "viewer", protocolVersion: 4, token: "synthetic-ticket" });
  await auth.promise;
  expect(sockets[0]!.frames).toEqual([]);
  connection.start();
  sockets[1]!.open();
  await sockets[1]!.sent((frame) => frame.type === "auth");
  sockets[1]!.close(1012);
  scheduler.advance(400);
  sockets[2]!.open();
  await sockets[2]!.sent((frame) => frame.type === "auth");
  sockets[2]!.receive({ type: "ready", role: "viewer", protocolVersion: 4 });
  sockets[2]!.receive({ type: "pong" });
  sockets[2]!.close(1012);
  expect(scheduler.nextDelay).toBe(400);
  connection.stop();
  expect(scheduler.pending).toBe(0);
});

it("aborts each socket scope before reconnect and ignores callbacks from the closed socket", async () => {
  const scheduler = new ManualScheduler(),
    sockets: RelaySocket[] = [];
  const authenticated: AbortSignal[] = [],
    delivered: AbortSignal[] = [];
  const connection = new RelayConnection({
    url: "wss://relay.example.test/relay",
    scheduler,
    status: () => {},
    authenticate: async (signal) => {
      authenticated.push(signal);
      return { type: "auth", role: "viewer", protocolVersion: 4, token: "synthetic" };
    },
    message: (_frame, signal) => {
      delivered.push(signal);
    },
    socket: () => {
      const socket = new RelaySocket();
      sockets.push(socket);
      return socket.asWebSocket();
    },
  });
  try {
    connection.start();
    const first = sockets[0]!;
    first.open();
    await first.sent((frame) => frame.type === "auth");
    first.receive({ type: "ready", role: "viewer", protocolVersion: 4 });
    const old = delivered[0]!;
    expect(old).toBe(authenticated[0]);
    first.close(1012);
    expect(old.aborted).toBe(true);
    scheduler.advance(400);
    const next = sockets[1]!;
    next.open();
    await next.sent((frame) => frame.type === "auth");
    next.receive({ type: "ready", role: "viewer", protocolVersion: 4 });
    expect(delivered[1]!.aborted).toBe(false);
    expect(delivered[1]).not.toBe(old);
    first.receive({ type: "pong" });
    first.open();
    await Promise.resolve();
    expect(delivered).toHaveLength(2);
    expect(authenticated).toHaveLength(2);
    connection.stop();
    expect(delivered[1]!.aborted).toBe(true);
    expect(scheduler.pending).toBe(0);
  } finally {
    connection.stop();
  }
});

it("ignores an old retry callback already queued when the connection was replaced", () => {
  const scheduler = new ManualScheduler(),
    retries: (() => void)[] = [],
    sockets: RelaySocket[] = [];
  const connection = new RelayConnection({
    url: "wss://relay.example.test/relay",
    scheduler: {
      now: scheduler.now,
      random: scheduler.random,
      interval: scheduler.interval,
      timeout: (callback, delay) => {
        retries.push(callback);
        return scheduler.timeout(callback, delay);
      },
    },
    authenticate: async () => ({
      type: "auth",
      role: "viewer",
      protocolVersion: 4,
      token: "synthetic",
    }),
    status: () => {},
    message: () => {},
    socket: () => {
      const socket = new RelaySocket();
      sockets.push(socket);
      return socket.asWebSocket();
    },
  });
  try {
    connection.start();
    sockets[0]!.close(1012);
    connection.restart();
    expect(sockets).toHaveLength(2);
    retries[0]!();
    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.readyState).toBe(0);
  } finally {
    connection.stop();
  }
});
