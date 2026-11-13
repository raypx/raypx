import { expect, it, vi } from "vitest";
import { ControlService } from "@raypx/control";
import { memoryControlRepository } from "@raypx/control/testing";
import type { AuthSession } from "@raypx/core/auth";
import { createApiApp } from "../helpers/app.js";

const session: AuthSession = {
  user: {
    id: "user",
    email: "user@example.test",
    name: "User",
    emailVerified: true,
    role: "member",
  },
  session: { id: "session", userId: "user", expiresAt: new Date(Date.now() + 60_000) },
};

const sessionCookie = "better-auth.session_token=fixture";

function fixture() {
  const readSession = vi.fn(async (headers: Headers) =>
    headers.get("cookie") === sessionCookie ? session : null,
  );
  const database = vi.fn(async () => {
    throw new Error("Private driver details");
  });
  const control = new ControlService(memoryControlRepository());
  const listTasks = vi.spyOn(control.tasks, "listTasks");
  const getTask = vi.spyOn(control.tasks, "getTask");
  const app = createApiApp({
    authHandler: async () => Response.json({}),
    readSession,
    allowedOrigins: [],
    readiness: { database },
    control,
  });
  return { app, database, listTasks, getTask, readSession };
}

it("serves one spec with native health and versioned oRPC schemas", async () => {
  const { app, database, readSession } = fixture();
  const response = await app.request("/api/openapi.json");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const spec = (await response.json()) as { paths: Record<string, object> };
  expect(spec).toMatchObject({
    openapi: "3.1.0",
    servers: [{ url: "/" }],
    paths: {
      "/health": { get: { responses: { 200: expect.any(Object) } } },
      "/ready": { get: { responses: { 200: expect.any(Object), 503: expect.any(Object) } } },
      "/api/v1/account": {
        get: {
          security: [{ sessionCookie: [] }, { secureSessionCookie: [] }],
          responses: { 200: expect.any(Object), default: expect.any(Object) },
        },
      },
      "/api/v1/account/access": {
        get: { security: [{}, { sessionCookie: [] }, { secureSessionCookie: [] }] },
      },
      "/api/v1/configuration": { get: { security: [] } },
      "/api/v1/observed-requests": { get: expect.any(Object) },
      "/api/v1/observed-requests/{id}": { get: expect.any(Object) },
      "/api/v1/tasks": {
        get: {
          parameters: expect.arrayContaining([
            expect.objectContaining({
              in: "query",
              name: "limit",
              schema: expect.objectContaining({ type: "integer" }),
            }),
          ]),
        },
      },
      "/api/v1/tasks/{id}": {
        get: {
          parameters: expect.arrayContaining([
            expect.objectContaining({ in: "path", name: "id", required: true }),
            expect.objectContaining({ in: "query", name: "after" }),
          ]),
        },
      },
    },
    components: { securitySchemes: { sessionCookie: { in: "cookie" } } },
  });
  const resources = Object.entries(spec.paths).filter(([path]) => path.startsWith("/api/v1/"));
  expect(resources).toHaveLength(14);
  for (const [, pathItem] of resources) {
    expect(Object.keys(pathItem)).toEqual(["get"]);
    expect(pathItem).not.toHaveProperty("get.requestBody");
  }
  expect(database).not.toHaveBeenCalled();
  expect(readSession).not.toHaveBeenCalled();
  const health = await app.request("/health");
  expect(await health.json()).toEqual({ status: "ok" });
  expect(database).not.toHaveBeenCalled();
  const ready = await app.request("/ready");
  expect(ready.status).toBe(503);
  expect(await ready.json()).toEqual({
    status: "unavailable",
    checks: { database: "unavailable" },
  });
});

it("uses the current session boundary for resource reads", async () => {
  const { app } = fixture();
  const denied = await app.request("/api/v1/account", {
    headers: { "x-request-id": "from-client" },
  });
  expect(denied.status).toBe(401);
  const requestId = denied.headers.get("x-request-id");
  expect(requestId).toMatch(/^req_[a-z]+$/);
  expect(await denied.json()).toMatchObject({
    code: "UNAUTHORIZED",
    data: { error: { code: "AUTH_REQUIRED" }, requestId },
  });
  const account = await app.request("/api/v1/account", { headers: { cookie: sessionCookie } });
  expect(account.status).toBe(200);
  expect(account.headers.get("cache-control")).toBe("no-store");
  expect(await account.json()).toEqual({ id: "user", email: "user@example.test", name: "User" });
});

it("validates path and query parameters before dispatching to the same task service", async () => {
  const { app, listTasks, getTask } = fixture();
  const id = crypto.randomUUID();
  const headers = { cookie: sessionCookie };
  expect((await app.request("/api/v1/tasks?limit=3", { headers })).status).toBe(200);
  expect(listTasks).toHaveBeenCalledWith(session.user.id, { limit: 3 });
  expect((await app.request("/api/v1/tasks?limit=0", { headers })).status).toBe(400);
  expect(listTasks).toHaveBeenCalledOnce();
  expect((await app.request("/api/v1/tasks/invalid", { headers })).status).toBe(400);
  expect(getTask).not.toHaveBeenCalled();
  expect(
    (await app.request(`/api/v1/tasks/${id}?after=2&beforeActivity=5`, { headers })).status,
  ).toBe(404);
  expect(getTask).toHaveBeenCalledWith(session.user.id, id, 2, 5);
});

it("supports HEAD and returns 405 only for known resource paths", async () => {
  const { app, readSession } = fixture();
  const headers = { cookie: sessionCookie };
  const head = await app.request("/api/v1/account", { method: "HEAD", headers });
  expect(head.status).toBe(200);
  expect(head.headers.get("cache-control")).toBe("no-store");
  expect(await head.text()).toBe("");
  expect((await app.request("/api/openapi.json", { method: "HEAD" })).status).toBe(200);
  for (const path of ["/api/v1/account", `/api/v1/jobs/${crypto.randomUUID()}/runs`]) {
    const response = await app.request(path, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(await response.json()).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });
  }
  expect((await app.request("/api/v1/unknown", { method: "POST" })).status).toBe(404);
  expect(readSession).toHaveBeenCalledOnce();
});

it("renders the combined reference with same-origin assets and a document-only script nonce", async () => {
  const { app, readSession } = fixture();
  const response = await app.request("/api/docs");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const csp = response.headers.get("content-security-policy");
  const nonce = csp?.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).toContain("connect-src 'self'");
  const html = await response.text();
  expect(html).toContain('src="/api/docs/assets/swagger-ui-bundle.js"');
  expect(html).toContain('href="/api/docs/assets/swagger-ui.css"');
  expect(html).toContain(`<script nonce="${nonce}">`);
  expect(html).toContain("health.readiness");
  expect(html).toContain("account.get");
  expect(readSession).not.toHaveBeenCalled();
  const spec = await app.request("/api/openapi.json");
  expect(spec.headers.get("content-security-policy")).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  );
});

it("keeps writes, enrollment and private transports outside the OpenAPI adapter", async () => {
  const { app, readSession } = fixture();
  const spec = (await (await app.request("/api/openapi.json")).json()) as {
    paths: Record<string, unknown>;
  };
  const excluded = [
    "/api/v1/account/get",
    "/api/v1/configuration/public",
    "/api/v1/configuration/updateStorage",
    "/api/v1/memory/delete",
    "/api/v1/relay/ticket",
    "/api/v1/hosts/grant",
    "/api/v1/instances/begin",
    "/api/v1/attachments/upload",
  ];
  for (const path of [...excluded, "/rpc/account/get", "/api/auth/get-session", "/relay"])
    expect(spec.paths).not.toHaveProperty([path]);
  for (const path of excluded)
    expect((await app.request(path, { method: "POST" })).status).toBe(404);
  expect(readSession).not.toHaveBeenCalled();
});
