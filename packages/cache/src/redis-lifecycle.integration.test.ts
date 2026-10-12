import { Redis } from "ioredis";
import { describe, expect, it, vi } from "vite-plus/test";

import { createRedisCache } from "./index.js";

describe("owned Redis connection failure", () => {
  it("disconnects the rejected client instead of leaving reconnect timers running", async () => {
    const disconnect = vi.spyOn(Redis.prototype, "disconnect");
    try {
      await expect(
        createRedisCache({
          url: "redis://127.0.0.1:1",
          connectTimeoutMs: 100,
          operationTimeoutMs: 100,
          maxRetriesPerRequest: 0,
        }),
      ).rejects.toBeInstanceOf(Error);
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      disconnect.mockRestore();
    }
  });
});
