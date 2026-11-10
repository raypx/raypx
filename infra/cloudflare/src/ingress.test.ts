import { describe, expect, it, vi } from "vite-plus/test";
import { containerEnvironment } from "./environment.js";
import { proxyRelay } from "./proxy.js";

const env = {
  DATABASE_URL: "postgresql://relay:password@db.example.com/raypx?sslmode=verify-full",
  REDIS_URL: "rediss://relay:password@redis.example.com:6380",
  ALLOWED_ORIGINS: "https://app.example.com,https://desktop.example.com",
};

describe("Cloudflare Relay ingress", () => {
  it.each(["/", "/api/auth/session", "/rpc/tasks", "/relay/private", "/%72elay"])(
    "does not wake a container for unknown route %s",
    async (path) => {
      const target = vi.fn();
      expect(
        (await proxyRelay(new Request(`https://app.example.com${path}`), env, target)).status,
      ).toBe(404);
      expect(target).not.toHaveBeenCalled();
    },
  );

  it("rejects methods, queries and non-upgrade requests before forwarding", async () => {
    const target = vi.fn();
    for (const [path, method, status] of [
      ["/relay", "POST", 405],
      ["/relay?ticket=secret", "GET", 400],
      ["/health?secret=hidden", "GET", 400],
      ["/relay", "GET", 426],
    ] as const) {
      const response = await proxyRelay(
        new Request(`https://app.example.com${path}`, { method }),
        env,
        target,
      );
      expect(response.status).toBe(status);
    }
    expect(target).not.toHaveBeenCalled();
  });

  it("gates browser origins exactly and accepts native clients without Origin", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    const target = vi.fn(() => ({ fetch }));
    for (const origin of ["null", "https://app.example.com.evil.test", "http://app.example.com"]) {
      expect(
        (
          await proxyRelay(
            new Request("https://app.example.com/relay", {
              headers: { Upgrade: "websocket", Origin: origin },
            }),
            env,
            target,
          )
        ).status,
      ).toBe(403);
    }
    expect(target).not.toHaveBeenCalled();
    for (const origin of [undefined, "https://app.example.com", "https://desktop.example.com"]) {
      const headers = new Headers({ Upgrade: "websocket" });
      if (origin) headers.set("Origin", origin);
      await proxyRelay(new Request("https://app.example.com/relay", { headers }), env, target);
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("strips auth headers while preserving upgrade headers and the exact response", async () => {
    // Node's Response cannot construct 101; identity checks catch reconstruction
    // without replacing the production WebSocket transport with a fake protocol.
    const upgrade = { status: 101, webSocket: {} } as unknown as Response;
    const fetch = vi.fn(async (_request: Request) => upgrade);
    const response = await proxyRelay(
      new Request("https://app.example.com/relay", {
        headers: {
          Cookie: "session=secret",
          Authorization: "Bearer secret",
          "Proxy-Authorization": "secret",
          Host: "app.example.com",
          Upgrade: "websocket",
          Connection: "Upgrade",
          Origin: "https://app.example.com",
          "Sec-WebSocket-Protocol": "relay-v4",
          "cf-container-target-port": "9999",
        },
      }),
      env,
      () => ({ fetch }),
    );
    expect(response).toBe(upgrade);
    const forwarded = fetch.mock.calls[0]![0];
    expect(forwarded.url).toBe("http://container/relay");
    expect(forwarded.redirect).toBe("manual");
    for (const header of [
      "Cookie",
      "Authorization",
      "Proxy-Authorization",
      "Host",
      "cf-container-target-port",
    ])
      expect(forwarded.headers.has(header)).toBe(false);
    expect(forwarded.headers.get("Upgrade")).toBe("websocket");
    expect(forwarded.headers.get("Origin")).toBe("https://app.example.com");
    expect(forwarded.headers.get("Sec-WebSocket-Protocol")).toBe("relay-v4");
  });

  it.each(["/health", "/ready"])("preserves %s readiness/liveness responses", async (path) => {
    const backend = new Response("ok", { status: 200 });
    expect(
      await proxyRelay(new Request(`https://app.example.com${path}`), env, () => ({
        fetch: async () => backend,
      })),
    ).toBe(backend);
  });

  it("fails closed without disclosing errors or retrying the container", async () => {
    const fetch = vi.fn(async () => {
      throw new Error(env.DATABASE_URL);
    });
    const response = await proxyRelay(new Request("https://app.example.com/ready"), env, () => ({
      fetch,
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Relay unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("hides SDK startup/proxy error responses", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const response = await proxyRelay(new Request("https://app.example.com/ready"), env, () => ({
      fetch: async () => new Response(body, { status: 500 }),
    }));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Relay unavailable");
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("container environment", () => {
  it("injects only Relay dependencies and fixed Bun server settings", () => {
    expect(containerEnvironment({ ...env, AUTH_SECRET: "must-not-leak" } as typeof env)).toEqual({
      ...env,
      NODE_ENV: "production",
      SERVER_ROLE: "relay",
      NITRO_HOST: "0.0.0.0",
      NITRO_PORT: "3002",
    });
  });

  it.each([
    { DATABASE_URL: "postgresql://user:secret@db.example.com/raypx" },
    { DATABASE_URL: env.DATABASE_URL.replace("verify-full", "require") },
    { DATABASE_URL: env.DATABASE_URL.replace("verify-full", "disable") },
    { REDIS_URL: "redis://user:secret@redis.example.com:6379" },
    { ALLOWED_ORIGINS: "*" },
    { ALLOWED_ORIGINS: "https://*.example.com" },
    { ALLOWED_ORIGINS: "https://app.example.com/path" },
    { ALLOWED_ORIGINS: "https://user:secret@app.example.com" },
    { ALLOWED_ORIGINS: "http://app.example.com" },
    { ALLOWED_ORIGINS: "" },
  ])("rejects unsafe configuration without including input in the error", (unsafe) => {
    expect(() => containerEnvironment({ ...env, ...unsafe })).toThrow(
      "Relay requires verified TLS database/Redis URLs and exact HTTPS origins",
    );
  });
});
