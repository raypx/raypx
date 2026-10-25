import { describe, expect, it, vi } from "vite-plus/test";
import { createApiClient } from "@raypx/client";
import { configurationDefaults, type ConfigurationSnapshot } from "@raypx/contracts/api";
import type { AuthSession } from "@raypx/auth/types";
import { createApiApp } from "../../server/api.js";
import { createConfigurationService } from "../../server/configuration/service.js";
import type { ConfigurationRepository } from "../../server/configuration/types.js";
import { getApiEnvironment } from "../../server/env.js";

function fixture() {
  let state: ConfigurationSnapshot = {
    values: { ...configurationDefaults },
    revision: 0,
    updatedAt: null,
  };
  let auth: AuthSession | null = {
    user: { id: "admin", email: "admin@example.test", name: "Admin", emailVerified: true },
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
  const configuration = createConfigurationService({
    repository,
    adminEmails: ["ADMIN@example.test"],
  });
  const authHandler = vi.fn(async () => Response.json({ ok: true }));
  const app = createApiApp({
    configuration,
    authHandler,
    readSession: async () => auth,
    allowedOrigins: ["https://web.example.test/", "invalid"],
    jobsEnabled: false,
    mailAvailable: true,
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
      { ...f.auth.user, email: "other@example.test" },
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
      createConfigurationService({ repository: f.repository, adminEmails: [] }).isAdmin(f.auth),
    ).toBe(false);
    expect(
      getApiEnvironment({ ADMIN_EMAILS: " Admin@example.test, owner@example.test " }).ADMIN_EMAILS,
    ).toEqual(["admin@example.test", "owner@example.test"]);
    expect(() => getApiEnvironment({ ADMIN_EMAILS: "not-an-email" })).toThrow("ADMIN_EMAILS");
  });
});
