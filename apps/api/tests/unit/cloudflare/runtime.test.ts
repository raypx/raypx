import { afterEach, expect, it, vi } from "vite-plus/test";
import { createApiApp } from "../../../server/api.js";
import { createCloudflareApp, type CloudflareRequest } from "../../../server/app/cloudflare.js";
import { getCloudflareEnvironment } from "../../../server/runtime/cloudflare.js";
import type { ApiRuntime } from "../../../server/runtime/shared.js";

afterEach(() => vi.restoreAllMocks());

it("reads request bindings without inheriting process configuration and prefers Hyperdrive", () => {
  expect(() => getCloudflareEnvironment({})).toThrow("Production requires");
  const environment = getCloudflareEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://direct:fixture@localhost/direct_test",
    HYPERDRIVE: { connectionString: "postgres://pooled:fixture@localhost/pooled_test" },
  });
  expect(environment.DATABASE_URL).toBe("postgres://pooled:fixture@localhost/pooled_test");
});

function runtime(close = vi.fn(async () => {})): Pick<ApiRuntime, "app" | "close"> {
  return {
    app: createApiApp({
      authHandler: async (request) => Response.json({ account: request.headers.get("x-test") }),
      readSession: async () => null,
      allowedOrigins: [],
    }),
    close,
  };
}

function workerRequest(
  value: string,
  waitUntil?: (task: Promise<unknown>) => void,
): CloudflareRequest {
  return Object.assign(
    new Request("https://api.example.test/api/auth/session", { headers: { "x-test": value } }),
    {
      runtime: {
        cloudflare: {
          env: { NODE_ENV: "test", DATABASE_URL: value },
          ...(waitUntil ? { context: { waitUntil } } : {}),
        },
      },
    },
  );
}

it("gives concurrent requests separate runtimes and schedules both cleanups", async () => {
  const tasks: Promise<unknown>[] = [];
  const first = runtime();
  const second = runtime();
  const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const app = createCloudflareApp(create);
  const responses = await Promise.all([
    app.fetch(workerRequest("first", (task) => tasks.push(task))),
    app.fetch(workerRequest("second", (task) => tasks.push(task))),
  ]);
  expect(await responses[0].json()).toEqual({ account: "first" });
  expect(await responses[1].json()).toEqual({ account: "second" });
  expect(create.mock.calls.map(([bindings]) => bindings.DATABASE_URL)).toEqual(["first", "second"]);
  await Promise.all(tasks);
  expect(first.close).toHaveBeenCalledOnce();
  expect(second.close).toHaveBeenCalledOnce();
});

it("awaits cleanup without a background context and sanitizes cleanup errors", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const resource = runtime(
    vi.fn(async () => {
      throw new Error("private-cleanup-token");
    }),
  );
  const response = await createCloudflareApp(async () => resource).fetch(workerRequest("fixture"));
  expect(response.status).toBe(200);
  expect(resource.close).toHaveBeenCalledOnce();
  expect(JSON.stringify(output.mock.calls)).not.toContain("private-cleanup-token");
});

it("returns a safe request identifier when initialization fails and can recover next request", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const create = vi
    .fn()
    .mockRejectedValueOnce(new Error("private-database-credentials"))
    .mockResolvedValueOnce(runtime());
  const app = createCloudflareApp(create);
  const failed = await app.fetch(workerRequest("fixture"));
  expect(failed.status).toBe(500);
  const body = await failed.json();
  expect(body).toEqual({
    error: { code: "INTERNAL_SERVER_ERROR" },
    requestId: failed.headers.get("x-request-id"),
  });
  expect(JSON.stringify(output.mock.calls)).not.toContain("private-database-credentials");
  expect((await app.fetch(workerRequest("recovered"))).status).toBe(200);
});

it("normalizes the worker relay origin whitelist and discards malformed entries", async () => {
  const forwarded = vi.fn(async () => new Response(null, { status: 204 }));
  const app = createCloudflareApp();
  const request = (origin: string): CloudflareRequest =>
    Object.assign(
      new Request("https://api.example.test/relay?account=account", {
        headers: { origin, upgrade: "websocket" },
      }),
      {
        runtime: {
          cloudflare: {
            env: {
              ALLOWED_ORIGINS: "invalid, https://web.example.test/",
              RAYPX_RELAY: { getByName: () => ({ fetch: forwarded }) },
            },
          },
        },
      },
    );
  expect((await app.fetch(request("https://web.example.test"))).status).toBe(204);
  expect((await app.fetch(request("https://attacker.example.test"))).status).toBe(403);
  expect(forwarded).toHaveBeenCalledOnce();
});
