import { describe, expect, it, vi } from "vite-plus/test";
import { createCloudAdmission, cloudConfiguration } from "./cloud-config.js";
import type { ApiRuntimeEnvironment } from "./env.js";

const production: ApiRuntimeEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://unused@example.invalid/db",
  AUTH_SECRET: "explicit-production-secret-configured",
  AUTH_URL: "https://api.example.test",
  ALLOWED_ORIGINS: ["https://example.test"],
  CACHE_PREFIX: "test",
  CACHE_REDIS_CONNECT_TIMEOUT_MS: 1000,
  CACHE_REDIS_OPERATION_TIMEOUT_MS: 1000,
  CACHE_REDIS_MAX_RETRIES_PER_REQUEST: 1,
};

describe("cloud admission", () => {
  it("requires explicit production quotas and paired storage credentials", () => {
    expect(() => cloudConfiguration({ ...production, CLOUD_SEARCH_ENABLED: true })).toThrow(
      "positive",
    );
    expect(() => cloudConfiguration({ ...production, S3_ACCESS_KEY_ID: "only-one-field" })).toThrow(
      "both credential",
    );
    expect(() =>
      cloudConfiguration({ ...production, AUTH_SECRET: "voidmix-development-secret-change-me" }),
    ).toThrow("AUTH_SECRET");
    expect(
      cloudConfiguration({
        ...production,
        CLOUD_SEARCH_ENABLED: true,
        CLOUD_ACCOUNT_MODEL_CALL_LIMIT: 100,
        CLOUD_ACCOUNT_CONCURRENCY: 2,
        CLOUD_ACCOUNT_STORAGE_BYTES: 104857600,
      }).flags.search,
    ).toBe(true);
  });
  it("keeps expensive requests unavailable when production limiter is absent", async () => {
    const admit = createCloudAdmission({
      production: true,
      flags: { search: true, computer: true },
      requestLimit: 20,
    });
    await expect(admit("account", "search")).rejects.toMatchObject({
      data: { error: { code: "CLOUD_RATE_LIMIT_UNAVAILABLE" } },
    });
  });
  it("rejects limits and unavailable Redis instead of admitting runs", async () => {
    const increment = vi.fn().mockResolvedValue(21);
    const admit = createCloudAdmission({
      production: true,
      flags: { search: true, computer: false },
      requestLimit: 20,
      increment,
    });
    await expect(admit("account", "search")).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(admit("account", "computer")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    increment.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(admit("account", "search")).rejects.toMatchObject({
      data: { error: { code: "CLOUD_RATE_LIMIT_UNAVAILABLE" } },
    });
  });
});
