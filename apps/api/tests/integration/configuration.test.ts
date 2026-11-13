import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { configurationDefaults, type ConfigurationSnapshot } from "@raypx/contracts/api";
import type { AuthSession } from "@raypx/core/auth";
import { createApiApp } from "../../src/routers/index.js";
import { createAccessPolicy } from "../../src/access.js";
import { hasPermission } from "@raypx/account/access";
import { createConfigurationService } from "../../src/config/service.js";
import type { ConfigurationRepository } from "../../src/config/types.js";
import { getApiEnvironment } from "../../src/env.js";
import { AuditService } from "../../src/administration/audit.js";
import type { ApiAppOptions } from "../../src/app/options.js";
import type { RateLimiter } from "../../src/rate-limit/types.js";

function fixture(options: Pick<ApiAppOptions, "audit" | "rateLimit"> = {}) {
  let state: ConfigurationSnapshot = {
    values: { ...configurationDefaults },
    revision: 0,
    updatedAt: null,
  };
  let auth: AuthSession | null = {
    user: {
      id: "admin",
      email: "admin@example.test",
      name: "Admin",
      emailVerified: true,
      role: "admin",
    },
    session: { id: "session", userId: "admin", expiresAt: new Date(Date.now() + 60000) },
  };
  const repository: ConfigurationRepository = {
    read: vi.fn(async () => structuredClone(state)),
    update: vi.fn(async (values, revision) => {
      if (revision !== state.revision) return null;
      state = { values, revision: revision + 1, updatedAt: new Date().toISOString() };
      return structuredClone(state);
    }),
  };
  const access = createAccessPolicy();
  const configuration = createConfigurationService({
    repository,
    access,
  });
  const authHandler = vi.fn(async () => Response.json({ ok: true }));
  const app = createApiApp({
    access,
    configuration,
    authHandler,
    readSession: async () => auth,
    allowedOrigins: ["https://web.example.test/", "invalid"],
    jobsEnabled: false,
    mailAvailable: async () => true,
    ...options,
  });
  const client = (origin: string = "https://web.example.test") =>
    createApiClient({
      baseUrl: "https://api.example.test",
      headers: origin ? { origin } : {},
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    }).configuration;
  return {
    app,
    client,
    repository,
    authHandler,
    setAuth: (next: AuthSession | null) => {
      auth = next;
    },
    get auth() {
      return auth!;
    },
  };
}

describe("administrator configuration", () => {
  it("requires a fresh verified administrator on every read and write", async () => {
    const f = fixture();
    expect(await f.client().access({})).toEqual({ allowed: true });
    expect(await f.client().get({})).toMatchObject({
      revision: 0,
      deployment: { jobsEnabled: false, mailConfigured: true },
    });
    for (const user of [
      { ...f.auth.user, emailVerified: false },
      { ...f.auth.user, role: "member" },
    ]) {
      f.setAuth({ ...f.auth, user });
      expect(await f.client().access({})).toEqual({ allowed: false });
      await expect(f.client().get({})).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        f.client().update({ values: configurationDefaults, revision: 0 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    f.setAuth(null);
    await expect(f.client().get({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(f.repository.update).not.toHaveBeenCalled();
  });

  it("rejects writes without a trusted origin and rejects unexpected configuration keys", async () => {
    const f = fixture();
    for (const origin of ["https://evil.example.test", ""]) {
      await expect(
        f.client(origin).update({ values: configurationDefaults, revision: 0 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      f.client().update({
        values: {
          ...configurationDefaults,
          ADMIN_EMAILS: "attacker@example.test",
        } as typeof configurationDefaults,
        revision: 0,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f.repository.update).not.toHaveBeenCalled();
  });

  it("checks permissions, per-procedure quotas and origin in order for every configuration write", async () => {
    const rateLimit = vi.fn<RateLimiter>();
    const f = fixture({ rateLimit });
    const admin = f.auth;
    const client = f.client("https://untrusted.example.test");
    const writes = {
      update: () => client.update({ values: configurationDefaults, revision: 0 }),
      updateStorage: () =>
        client.updateStorage({
          values: {
            endpoint: "https://s3.example.test",
            region: "us-east-1",
            bucket: "test-bucket",
            enabled: true,
          },
          revision: 0,
        }),
      updateResend: () =>
        client.updateResend({
          values: { from: "sender@example.test", defaultLocale: "en", enabled: true },
          revision: 0,
        }),
    };
    f.setAuth({ ...admin, user: { ...admin.user, role: "member" } });
    for (const write of Object.values(writes)) {
      await expect(write()).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: { error: { code: "FORBIDDEN" } },
      });
    }
    expect(rateLimit).not.toHaveBeenCalled();

    f.setAuth(admin);
    for (const [procedure, write] of Object.entries(writes)) {
      rateLimit.mockClear();
      rateLimit.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await expect(write()).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
        data: { error: { code: "RATE_LIMITED" } },
      });
      await expect(write()).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: { error: { code: "ORIGIN_REJECTED" } },
      });
      expect(rateLimit.mock.calls).toEqual([
        [`rpc:admin:configuration.${procedure}`, { window: 60, max: 10 }],
        [`rpc:admin:configuration.${procedure}`, { window: 60, max: 10 }],
      ]);
    }
    expect(f.repository.update).not.toHaveBeenCalled();
  });

  it("rate limits audited HTTP requests before opening an audit record", async () => {
    const begin = vi.fn(async () => "audit-id");
    const audit = new AuditService({ begin, finish: async () => {} });
    const rateLimit = vi.fn(async () => false);
    const f = fixture({ audit, rateLimit });
    const response = await f.app.request("/api/auth/admin/set-role", { method: "POST" });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      code: "RATE_LIMITED",
      message: "Too many administration requests",
    });
    expect(rateLimit).toHaveBeenCalledExactlyOnceWith("admin.audit:admin", { window: 60, max: 60 });
    expect(begin).not.toHaveBeenCalled();
    expect(f.authHandler).not.toHaveBeenCalled();
  });

  it("saves validated values, exposes only public fields, and refuses stale versions", async () => {
    const f = fixture();
    const values = {
      ...configurationDefaults,
      siteName: "  My workspace  ",
      registrationEnabled: false,
      cleanupEnabled: false,
    };
    expect(await f.client().update({ values, revision: 0 })).toMatchObject({
      values: { ...values, siteName: "My workspace" },
      revision: 1,
    });
    await expect(f.client().update({ values, revision: 0 })).rejects.toMatchObject({
      code: "CONFLICT",
      data: { error: { code: "CONFIGURATION_CONFLICT" } },
    });
    f.setAuth(null);
    expect(await f.client().public({})).toEqual({
      siteName: "My workspace",
      registrationEnabled: false,
    });
  });

  it("enforces registration policy on the server and keeps sign-in available", async () => {
    const f = fixture();
    await f
      .client()
      .update({ values: { ...configurationDefaults, registrationEnabled: false }, revision: 0 });
    const closed = await f.app.request("/api/auth/sign-up/email", { method: "POST" });
    expect(closed.status).toBe(403);
    expect(await closed.json()).toMatchObject({ code: "REGISTRATION_DISABLED" });
    expect(f.authHandler).not.toHaveBeenCalled();
    expect((await f.app.request("/api/auth/sign-in/email", { method: "POST" })).status).toBe(200);
  });

  it("fails closed without exposing database diagnostics", async () => {
    const f = fixture();
    vi.mocked(f.repository.read).mockRejectedValue(
      new Error("postgres://private:password@host/db"),
    );
    await expect(f.client().get({})).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      data: { error: { code: "CONFIGURATION_UNAVAILABLE" } },
    });
    const response = await f.app.request("/api/auth/sign-up/email", { method: "POST" });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("password");
    expect(f.authHandler).not.toHaveBeenCalled();
  });

  it("has no implicit administrator and validates deployment email addresses", () => {
    const f = fixture();
    expect(
      hasPermission(
        createAccessPolicy()({ ...f.auth, user: { ...f.auth.user, role: "member" } }),
        "configuration.read",
      ),
    ).toBe(false);
    expect(
      getApiEnvironment({ ADMIN_EMAILS: " Admin@example.test, owner@example.test " }).ADMIN_EMAILS,
    ).toEqual(["admin@example.test", "owner@example.test"]);
    expect(() => getApiEnvironment({ ADMIN_EMAILS: "not-an-email" })).toThrow("ADMIN_EMAILS");
  });
});
