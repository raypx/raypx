import { memoryControlRepository } from "@raypx/control/testing";
import { describe, expect, it, vi } from "vite-plus/test";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../server/api.js";
import { ControlService } from "@raypx/control";
import type { AuthSession } from "@raypx/core/auth";

const session: AuthSession = {
  user: { id: "u1", email: "a@example.com", name: "A", emailVerified: true, role: "member" },
  session: { id: "s1", userId: "u1", expiresAt: new Date(Date.now() + 60000) },
};
const app = createApiApp({
  authHandler: async () => Response.json({ auth: true }),
  readSession: async (headers) => (headers.get("cookie") === "signed-in" ? session : null),
  allowedOrigins: ["https://web.example.com"],
});
const client = (cookie?: string) =>
  createApiClient({
    baseUrl: "https://api.example.com",
    ...(cookie ? { headers: { cookie } } : {}),
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
describe("HTTP foundation", () => {
  it("normalizes CORS origins and ignores malformed configuration entries", async () => {
    const normalized = createApiApp({
      authHandler: async () => Response.json({}),
      readSession: async () => null,
      allowedOrigins: ["invalid", "null", "https://web.example.com/", "views://main/"],
    });
    const response = await normalized.request("/health", {
      headers: { origin: "https://web.example.com" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://web.example.com");
    expect(
      (
        await normalized.request("/health", { headers: { origin: "https://untrusted.test" } })
      ).headers.has("access-control-allow-origin"),
    ).toBe(false);
  });
  it("rejects unavailable authentication mail actions before dispatch without blocking health or sign-in", async () => {
    let dispatched = 0;
    const unavailable = createApiApp({
      mailAvailable: false,
      allowedOrigins: [],
      readSession: async () => null,
      authHandler: async () => {
        dispatched += 1;
        return Response.json({ delegated: true });
      },
    });
    for (const path of [
      "sign-up/email",
      "send-verification-email",
      "request-password-reset",
      "sign-up/email/",
    ]) {
      const response = await unavailable.request(`/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "private@example.com", token: "private-token" }),
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        code: "MAIL_NOT_CONFIGURED",
        message: "Authentication email is unavailable",
      });
    }
    expect(dispatched).toBe(0);
    expect((await unavailable.request("/health")).status).toBe(200);
    expect((await unavailable.request("/api/auth/get-session")).status).toBe(200);
    expect((await unavailable.request("/api/auth/sign-in/email", { method: "POST" })).status).toBe(
      200,
    );
    expect(dispatched).toBe(2);
  });

  it("authenticates each account request with no legacy role requirement", async () => {
    expect(await client("signed-in").account.get({})).toEqual({
      id: "u1",
      email: "a@example.com",
      name: "A",
    });
    await expect(client().account.get({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      data: { error: { code: "AUTH_REQUIRED" } },
    });
  });

  it("keeps public health, native auth and unknown API routes distinct", async () => {
    expect(await (await app.request("/health")).json()).toEqual({ status: "ok" });
    expect(await (await app.request("/api/auth/get-session")).json()).toEqual({ auth: true });
    for (const path of [
      "/rpc/cloud/list",
      "/api/unknown",
      "/assets/missing.js",
      "/assets/missing",
      "/missing%2Epng",
      // Web pages are served by the Web application, never by the API.
      "/settings/account",
    ])
      expect((await app.request(path, { headers: { accept: "text/html" } })).status).toBe(404);
  });

  it("allows only explicit credentialed origins and adds request IDs", async () => {
    const ok = await app.request("/health", { headers: { origin: "https://web.example.com" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://web.example.com");
    expect(ok.headers.get("x-request-id")).toBeTruthy();
    expect(
      (await app.request("/health", { headers: { origin: "null" } })).headers.get(
        "access-control-allow-origin",
      ),
    ).toBeNull();
  });

  it("answers preflights only for allowed origins and lets browsers cache them", async () => {
    const preflight = (origin: string) =>
      app.request("/rpc/account/get", {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
    const allowed = await preflight("https://web.example.com");
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://web.example.com");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("access-control-max-age")).toBe("600");
    expect(
      (await preflight("https://evil.example.com")).headers.get("access-control-allow-origin"),
    ).toBeNull();
  });

  it("lets trusted browser origins read authentication retry delays", async () => {
    const limited = createApiApp({
      authHandler: async () =>
        Response.json(
          { message: "Too many requests" },
          {
            status: 429,
            headers: { "X-Retry-After": "90" },
          },
        ),
      readSession: async () => null,
      allowedOrigins: ["https://web.example.com"],
    });
    const response = await limited.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { origin: "https://web.example.com" },
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("x-retry-after")).toBe("90");
    const exposed = response.headers
      .get("access-control-expose-headers")
      ?.toLowerCase()
      .split(/,\s*/);
    expect(exposed).toEqual(expect.arrayContaining(["retry-after", "x-retry-after"]));
  });

  it("sends security headers without blocking cross-origin API reads", async () => {
    const response = await app.request("/health", {
      headers: { origin: "https://web.example.com" },
    });
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
    expect(response.headers.get("cross-origin-resource-policy")).toBeNull();
  });

  it("reports readiness per dependency without exposing errors", async () => {
    const probe = (readiness: Record<string, () => Promise<unknown>>) =>
      createApiApp({
        authHandler: async () => Response.json({}),
        readSession: async () => null,
        allowedOrigins: [],
        readiness,
      }).request("/ready");
    const ready = await probe({ database: async () => 1, redis: async () => "PONG" });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok" },
    });
    const failing = await probe({
      database: async () => 1,
      redis: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:6379");
      },
    });
    expect(failing.status).toBe(503);
    const body = await failing.text();
    expect(JSON.parse(body)).toEqual({
      status: "unavailable",
      checks: { database: "ok", redis: "unavailable" },
    });
    expect(body).not.toContain("ECONNREFUSED");
  });

  it("answers slow procedures with a timeout", async () => {
    const control = new ControlService(memoryControlRepository());
    vi.spyOn(control.credentials, "listDevices").mockImplementation(() => new Promise(() => {}));
    const slow = createApiApp({
      authHandler: async () => Response.json({}),
      readSession: async () => session,
      allowedOrigins: [],
      rpcTimeoutMs: 50,
      control,
    });
    const api = createApiClient({
      baseUrl: "https://api.example.com",
      fetch: async (input, init) => slow.fetch(new Request(input, init)),
    });
    expect(await api.devices.list({}).catch((value: unknown) => value)).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      data: { error: { code: "REQUEST_TIMEOUT" } },
    });
  });

  it.each([
    '{"__proto__":{"admin":true}}',
    '{"metadata":[{"__proto__":{"admin":true}}]}',
    '{"constructor":{"prototype":{"admin":true}}}',
    '{"metadata":[{"constructor":{"prototype":{"admin":true}}}]}',
  ])("rejects prototype-polluting RPC input: %s", async (json) => {
    const polluted = JSON.parse(json);
    expect(
      await client("signed-in")
        .account.get(polluted)
        .catch((value: unknown) => value),
    ).toMatchObject({
      code: "BAD_REQUEST",
      data: { error: { code: "INVALID_INPUT" } },
    });
  });

  it.each([
    '{"constructor":{"name":"ordinary data"}}',
    '{"constructor.prototype":{"admin":true},"metadata":[{"prototype":true}]}',
  ])("accepts harmless RPC property names: %s", async (json) => {
    expect(await client("signed-in").account.get(JSON.parse(json))).toMatchObject({ id: "u1" });
  });

  it("rejects rate-limited grant procedures per account before running them", async () => {
    const keys: string[] = [];
    const limited = createApiApp({
      authHandler: async () => Response.json({}),
      readSession: async () => session,
      allowedOrigins: [],
      // A rejecting limiter must stop the call before the control service runs.
      control: {} as ControlService,
      rateLimit: async (key) => {
        keys.push(key);
        return false;
      },
    });
    const api = createApiClient({
      baseUrl: "https://api.example.com",
      fetch: async (input, init) => limited.fetch(new Request(input, init)),
    });
    const error = await api.relay.ticket({}).catch((value: unknown) => value);
    expect(error).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      data: { error: { code: "RATE_LIMITED" } },
    });
    expect(keys).toEqual(["rpc:u1:relay.ticket"]);
  });
});
