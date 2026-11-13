import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { accessForRole } from "@raypx/account/access";
import type { AuthSession } from "@raypx/core/auth";
import { createApiApp } from "../../src/routers/index.js";
import { createAccessPolicy } from "../../src/access.js";

function fixture() {
  let session: AuthSession | null = null;
  const readSession = vi.fn(async () => session);
  const app = createApiApp({
    access: createAccessPolicy(),
    authHandler: async () => Response.json({}),
    readSession,
    allowedOrigins: [],
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  return {
    app,
    client,
    readSession,
    setSession: (next: AuthSession | null) => {
      session = next;
    },
  };
}

const admin: AuthSession = {
  user: {
    id: "admin",
    email: "Admin@example.test",
    name: "Admin",
    emailVerified: true,
    role: "admin",
  },
  session: { id: "s", userId: "admin", expiresAt: new Date(Date.now() + 60_000) },
};

it("projects fresh guest/member/admin grants without exposing session fields", async () => {
  const f = fixture();
  expect(await f.client.account.access({})).toEqual(accessForRole("guest", null));
  f.setSession(admin);
  expect(await f.client.account.access({})).toEqual(accessForRole("admin", "admin"));
  f.setSession({ ...admin, user: { ...admin.user, role: "member" } });
  expect(await f.client.account.access({})).toEqual(accessForRole("member", "admin"));
  f.setSession(null);
  expect(await f.client.account.access({})).toEqual(accessForRole("guest", null));
  expect(f.readSession).toHaveBeenCalledTimes(4);
});

it("rejects forged role inputs and grants nothing for unverified, expired or mismatched sessions", async () => {
  const f = fixture();
  f.setSession(admin);
  const forged = await f.app.request("/rpc/account/access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { role: "admin" } }),
  });
  expect(forged.status).toBe(400);
  const missingRole = structuredClone(admin);
  delete missingRole.user.role;
  for (const session of [
    { ...admin, user: { ...admin.user, emailVerified: false } },
    { ...admin, session: { ...admin.session, expiresAt: new Date(0) } },
    { ...admin, session: { ...admin.session, userId: "other" } },
    missingRole,
    { ...admin, user: { ...admin.user, role: "owner" } },
    { ...admin, user: { ...admin.user, role: "admin,unknown" } },
    { ...admin, user: { ...admin.user, banned: true } },
  ]) {
    f.setSession(session);
    expect(await f.client.account.access({})).toEqual(accessForRole("guest", null));
    await expect(f.client.configuration.get({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
});

it("checks remote permissions before reading private services", async () => {
  const app = createApiApp({
    access: () => ({ ...accessForRole("member", "admin"), permissions: [] }),
    authHandler: async () => Response.json({}),
    readSession: async () => admin,
    allowedOrigins: [],
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  for (const read of [
    () => client.tasks.list({}),
    () => client.approvals.list({}),
    () => client.jobs.list({}),
    () => client.memory.list({}),
  ])
    await expect(read()).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("shares dependency results between public readiness and authorized administrator health", async () => {
  const database = vi.fn(async () => {});
  const app = createApiApp({
    access: createAccessPolicy(),
    authHandler: async () => Response.json({}),
    readSession: async (headers) => (headers.get("cookie") === "admin" ? admin : null),
    allowedOrigins: [],
    readiness: { database },
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  await expect(client.admin.health({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(database).not.toHaveBeenCalled();
  const ready = await app.request("/ready");
  expect(ready.status).toBe(200);
  expect(ready.headers.get("cache-control")).toBe("no-store");
  const authenticated = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { cookie: "admin" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  await expect(authenticated.admin.health({})).resolves.toMatchObject({
    checks: { database: "ok", redis: "not-configured", relay: "not-configured" },
  });
  expect(database).toHaveBeenCalledOnce();
});

it("checks the declared admin permission for overview, health and audit", async () => {
  let session: AuthSession | null = null;
  const rateLimit = vi.fn(async () => true);
  const app = createApiApp({
    access: (auth) =>
      auth?.user.role === "admin"
        ? { ...accessForRole("admin", auth.user.id), permissions: ["admin.read"] }
        : accessForRole("member", auth?.user.id ?? null),
    authHandler: async () => Response.json({}),
    readSession: async () => session,
    allowedOrigins: [],
    rateLimit,
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  const reads = [
    () => client.admin.overview({}),
    () => client.admin.health({}),
    () => client.admin.audit({}),
  ];
  for (const read of reads) await expect(read()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  session = { ...admin, user: { ...admin.user, role: "member" } };
  for (const read of reads) await expect(read()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rateLimit).not.toHaveBeenCalled();

  session = admin;
  await expect(client.admin.health({})).resolves.toHaveProperty("checks");
  await expect(client.admin.audit({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(rateLimit).toHaveBeenCalledExactlyOnceWith("rpc:admin:admin.health", {
    window: 60,
    max: 60,
  });
});
