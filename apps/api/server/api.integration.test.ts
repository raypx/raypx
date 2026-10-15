import { describe, expect, it } from "vite-plus/test";
import { createApiClient } from "@raypx/client";
import { createApiApp } from "./api.js";
import type { AuthSession } from "@raypx/auth/types";
const session: AuthSession = {
  user: { id: "u1", email: "a@example.com", name: "A", emailVerified: true },
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
});
