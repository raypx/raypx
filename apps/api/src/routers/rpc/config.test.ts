import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import type { SandboxSettingsSnapshot } from "@raypx/contracts/api";
import type { AuthSession } from "@raypx/core/auth";
import { createApiApp } from "../../../tests/helpers/app.js";

function fixture() {
  let auth: AuthSession | null = {
    user: {
      id: "admin",
      name: "Admin",
      email: "admin@example.test",
      emailVerified: true,
      role: "admin",
    },
    session: { id: "session", userId: "admin", expiresAt: new Date(Date.now() + 60_000) },
  };
  const configured = vi.fn(async (_accountId: string) => false);
  const sandbox = vi.fn(async (): Promise<SandboxSettingsSnapshot> => ({
    values: { provider: "none", url: null, screen: false },
    hasCredential: false,
    revision: 0,
    updatedAt: null,
  }));
  const mail = vi.fn(async () => false);
  const app = createApiApp({
    readSession: async () => auth,
    conversationModels: { configured, list: vi.fn(async () => []) },
    sandboxSettings: { read: sandbox, update: vi.fn(), test: vi.fn() },
    mailAvailable: mail,
  });
  const client = createApiClient({
    baseUrl: "http://api.example.test",
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  return {
    client,
    configured,
    sandbox,
    mail,
    setAuth: (value: AuthSession | null) => {
      auth = value;
    },
    get auth() {
      return auth!;
    },
  };
}
it("returns only current setup booleans to the admitted administrator, without Space reads", async () => {
  const f = fixture();
  expect(await f.client.configuration.setupStatus({})).toEqual({
    model: false,
    sandbox: false,
    mail: false,
  });
  expect(f.configured).toHaveBeenCalledExactlyOnceWith("admin");
  f.configured.mockResolvedValue(true);
  f.mail.mockResolvedValue(true);
  f.sandbox.mockResolvedValue({
    values: { provider: "docker", url: "http://127.0.0.1:58000", screen: false },
    hasCredential: true,
    revision: 2,
    updatedAt: null,
  });
  expect(await f.client.configuration.setupStatus({})).toEqual({
    model: true,
    sandbox: true,
    mail: true,
  });
  f.sandbox.mockResolvedValue({
    values: { provider: "docker", url: "http://127.0.0.1:58000", screen: false },
    hasCredential: false,
    revision: 3,
    updatedAt: null,
  });
  expect((await f.client.configuration.setupStatus({})).sandbox).toBe(false);
});
it("refuses members and guests before reading administrator-only state, including role revocation", async () => {
  const f = fixture();
  const admin = f.auth;
  await f.client.configuration.setupStatus({});
  f.configured.mockClear();
  f.sandbox.mockClear();
  f.mail.mockClear();
  f.setAuth({ ...admin, user: { ...admin.user, role: "member" } });
  await expect(f.client.configuration.setupStatus({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  f.setAuth(null);
  await expect(f.client.configuration.setupStatus({})).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(f.configured).not.toHaveBeenCalled();
  expect(f.sandbox).not.toHaveBeenCalled();
  expect(f.mail).not.toHaveBeenCalled();
});
it("does not substitute unconfigured booleans when the current server read fails", async () => {
  const f = fixture();
  f.sandbox.mockRejectedValue(new Error("private connection diagnostic"));
  await expect(f.client.configuration.setupStatus({})).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
  });
});
