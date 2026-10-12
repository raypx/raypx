import type { RedisCacheConnection } from "@voidmix/cache";
import { describe, expect, it, vi } from "vite-plus/test";

import { connectAdmissionCache } from "./admission-cache.js";
import { createCloudAdmission } from "./cloud-config.js";

describe("Redis admission isolation", () => {
  it("keeps a healthy connection available to the admission limiter", async () => {
    const connection = {} as RedisCacheConnection;
    const connect = vi.fn(async () => connection);
    expect(await connectAdmissionCache({ url: "redis://localhost:6379" }, connect)).toBe(
      connection,
    );
    expect(connect).toHaveBeenCalledWith({ url: "redis://localhost:6379" });
  });

  it("allows API composition after connection failure while rejecting new production runs", async () => {
    const connection = await connectAdmissionCache({ url: "redis://localhost:6379" }, async () => {
      throw new Error("connection refused");
    });
    expect(connection).toBeUndefined();
    const admit = createCloudAdmission({
      production: true,
      flags: { search: true, computer: true },
      requestLimit: 20,
    });
    await expect(admit("actor", "search")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      data: { error: { code: "CLOUD_RATE_LIMIT_UNAVAILABLE" } },
    });
  });
});
