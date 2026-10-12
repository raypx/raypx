import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  constructorCalls: [] as Array<{ options: Record<string, unknown>; url: string }>,
  ping: vi.fn(async () => "PONG"),
  quit: vi.fn(async () => "OK"),
  disconnect: vi.fn(),
  on: vi.fn(),
}));

vi.mock("ioredis", () => ({
  Redis: class {
    connect = mocks.connect;
    ping = mocks.ping;
    quit = mocks.quit;
    disconnect = mocks.disconnect;
    on = mocks.on;

    constructor(url: string, options: Record<string, unknown>) {
      mocks.constructorCalls.push({ options, url });
    }
  },
}));

const { createRedisCache } = await import("./index.js");

beforeEach(() => {
  mocks.constructorCalls.length = 0;
  vi.clearAllMocks();
});

describe("Redis connection", () => {
  it("uses native RESP3 reply mapping", async () => {
    const connection = await createRedisCache({ url: "redis://cache.example.test:6379" });

    expect(mocks.constructorCalls).toEqual([
      {
        url: "redis://cache.example.test:6379",
        options: expect.objectContaining({ protocol: 3, replyMapping: "resp3" }),
      },
    ]);
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.ping).toHaveBeenCalledOnce();

    await connection.close();
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
});
