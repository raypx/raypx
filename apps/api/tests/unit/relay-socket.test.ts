import { beforeEach, expect, it, vi } from "vite-plus/test";
import type { RelayPeer } from "../../server/relay/hub.js";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  receive: vi.fn(),
  close: vi.fn(),
  allowedOrigins: ["https://app.example.test"],
}));
// Expose the crossws hooks directly instead of Nitro's upgrade wrapper.
vi.mock("nitro", () => ({ defineWebSocketHandler: (hooks: unknown) => hooks }));
vi.mock("../../server/runtime/server.js", () => ({
  serverRelay: { open: mocks.open, receive: mocks.receive, close: mocks.close },
}));
vi.mock("../../server/env.js", () => ({
  getApiEnvironment: () => ({ allowedOrigins: mocks.allowedOrigins }),
}));

const { default: socket } = (await import("../../server/relay/server.js")) as unknown as {
  default: {
    upgrade(request: Request): void;
    open(peer: unknown): void;
    message(peer: unknown, message: { text(): string }): unknown;
    close(peer: unknown): unknown;
    error(peer: unknown): unknown;
  };
};
beforeEach(() => vi.clearAllMocks());

function opened(bufferedAmount: number) {
  const peer = { id: "peer-1", bufferedAmount, send: vi.fn(), close: vi.fn() };
  socket.open(peer);
  const connection = mocks.open.mock.calls[0]![0] as RelayPeer;
  return { peer, connection };
}

it("rejects upgrades from origins outside the allowlist", () => {
  const upgrade = (origin?: string) =>
    socket.upgrade(
      new Request("https://api.example.test/relay", {
        headers: origin ? { origin } : {},
      }),
    );
  expect(() => upgrade("https://app.example.test")).not.toThrow();
  // Native clients connect without an Origin header.
  expect(() => upgrade()).not.toThrow();
  let rejected: unknown;
  try {
    upgrade("https://evil.example.test");
  } catch (error) {
    rejected = error;
  }
  expect(rejected).toBeInstanceOf(Response);
  expect((rejected as Response).status).toBe(403);
});

it("sends JSON frames while the peer buffer is below one MiB", () => {
  const { peer, connection } = opened(1024 * 1024);
  connection.send({ type: "pong" } as never);
  expect(peer.send).toHaveBeenCalledWith('{"type":"pong"}');
  expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ id: "peer-1" }));
});

it("signals backpressure from the portable peer buffer instead of sending", () => {
  // crossws reports Bun's getBufferedAmount() here; peer.websocket.bufferedAmount is undefined on Bun.
  const { peer, connection } = opened(1024 * 1024 + 1);
  expect(() => connection.send({ type: "pong" } as never)).toThrow("Backpressure");
  expect(peer.send).not.toHaveBeenCalled();
});

it("forwards text, close codes and teardown to the hub by peer id", async () => {
  const { peer, connection } = opened(0);
  connection.close(4001, "UNAUTHORIZED");
  expect(peer.close).toHaveBeenCalledWith(4001, "UNAUTHORIZED");
  await socket.message(peer, { text: () => '{"type":"ping"}' });
  expect(mocks.receive).toHaveBeenCalledWith("peer-1", '{"type":"ping"}');
  await socket.close(peer);
  await socket.error(peer);
  expect(mocks.close).toHaveBeenCalledTimes(2);
  expect(mocks.close).toHaveBeenCalledWith("peer-1");
});
