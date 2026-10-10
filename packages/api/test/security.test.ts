import { apiErrorResponseSchema } from "@raypx/contracts/errors";
import { createLogger } from "@raypx/logger";
import { expect, test, vi } from "vite-plus/test";
import { withHttpRequest, type RequestGuard, type HttpHeaders } from "../src/http.js";
import {
  assertSameOrigin,
  createRateLimiter,
  createRateLimitGuard,
  createSameOriginGuard,
} from "../src/security.js";

const logger = createLogger({ level: "silent" });
const write = (headers: HttpHeaders = {}, method = "POST") =>
  new Request("http://internal-host/api/items", { method, headers });

test("reserves a fixed-window quota and resets exactly at the boundary", () => {
  let now = 1000;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1500, now: () => now });
  expect(limiter.consume("a")).toMatchObject({ allowed: true, remaining: 1, resetAtMs: 2500 });
  expect(limiter.consume("a")).toMatchObject({ allowed: true, remaining: 0 });
  now = 2499;
  expect(limiter.consume("a")).toMatchObject({
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 1,
  });
  now = 2500;
  expect(limiter.consume("a")).toMatchObject({ allowed: true, remaining: 1, resetAtMs: 4000 });
  now = 1000;
  expect(limiter.consume("a").resetAtMs).toBe(4000);
});

test("isolates keys and limiter instances while failing closed at bounded capacity", () => {
  let now = 0;
  const options = { limit: 1, windowMs: 1000, maxKeys: 2, now: () => now };
  const limiter = createRateLimiter(options);
  expect(limiter.consume("a").allowed).toBe(true);
  now = 500;
  expect(limiter.consume("b").allowed).toBe(true);
  expect(limiter.consume("a").allowed).toBe(false);
  expect(limiter.consume("untracked")).toMatchObject({ allowed: false, remaining: 0 });
  expect(createRateLimiter(options).consume("a").allowed).toBe(true);
  now = 1000;
  expect(limiter.consume("c").allowed).toBe(true);
  now = 1500;
  expect(limiter.consume("d").allowed).toBe(true);
  limiter.clear();
  expect(limiter.consume("c").allowed).toBe(true);
});

test("keeps concurrent reservations atomic and ignores untrusted proxy IP headers", async () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 1000 });
  const handler = vi.fn<() => Promise<Response>>(async () => {
    await Promise.resolve();
    return Response.json({ ok: true });
  });
  const responses = await Promise.all(
    Array.from({ length: 20 }, (_, id) =>
      withHttpRequest(
        write({ "x-forwarded-for": `203.0.113.${id}`, "x-request-id": `request-${id}` }),
        handler,
        { logger, guards: [createRateLimitGuard({ limiter })] },
      ),
    ),
  );
  expect(handler).toHaveBeenCalledTimes(3);
  expect(responses.filter((response) => response.status === 200)).toHaveLength(3);
  expect(responses.filter((response) => response.status === 429)).toHaveLength(17);
  const allowed = responses[0];
  const denied = responses[3];
  expect(allowed?.headers.get("x-ratelimit-limit")).toBe("3");
  expect(allowed?.headers.get("retry-after")).toBeNull();
  expect(denied?.headers.get("retry-after")).toBe("1");
  expect(denied?.headers.get("x-ratelimit-remaining")).toBe("0");
  expect(denied?.headers.get("x-ratelimit-reset")).toBe("2");
  expect(denied?.headers.get("x-request-id")).toBe("request-3");
  expect(apiErrorResponseSchema.parse(await denied?.json()).error).toEqual({
    code: "RATE_LIMITED",
    message: "Too many requests",
    requestId: "request-3",
  });
});

test("preserves guard headers on handler errors and lets nested policies take precedence", async () => {
  const incoming = write();
  const headerGuard: RequestGuard = () => ({ "x-ratelimit-limit": "100", "x-policy": "outer" });
  const nested: RequestGuard = () => ({ "x-ratelimit-limit": "5" });
  const response = await withHttpRequest(
    incoming,
    () =>
      withHttpRequest(incoming, () => new Response("private stack", { status: 500 }), {
        guards: [nested],
      }),
    { logger, guards: [headerGuard] },
  );
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private stack");
  expect(response.headers.get("x-ratelimit-limit")).toBe("5");
  expect(response.headers.get("x-policy")).toBe("outer");
});

test("guards run in order and block business work before side effects", async () => {
  const effect = vi.fn<() => Response>(() => new Response("changed"));
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
  const response = await withHttpRequest(write({ origin: "https://evil.example" }), effect, {
    logger,
    guards: [
      createRateLimitGuard({ limiter }),
      createSameOriginGuard({ origin: "https://app.example" }),
    ],
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
  expect(apiErrorResponseSchema.parse(await response.json()).error.code).toBe("FORBIDDEN");
  expect(effect).not.toHaveBeenCalled();
});

test("uses a configured origin independently of internal URLs or proxy headers", () => {
  const options = { origin: "https://app.example:8443" };
  expect(() =>
    assertSameOrigin(
      write({ origin: options.origin, "x-forwarded-host": "evil.example" }),
      options,
    ),
  ).not.toThrow();
  expect(() =>
    assertSameOrigin(write({ referer: `${options.origin}/account?private=value` }), options),
  ).not.toThrow();
  for (const method of ["GET", "HEAD", "OPTIONS"])
    expect(() => assertSameOrigin(write({}, method), options)).not.toThrow();
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    expect(() => assertSameOrigin(write({}, method), options)).toThrow("Access denied");
});

const invalidSources: Exclude<HttpHeaders, undefined>[] = [
  { origin: "https://evil.example" },
  { origin: "https://app.example.evil.test" },
  { origin: "http://app.example" },
  { origin: "https://app.example:8443" },
  { origin: "null" },
  { origin: "" },
  { origin: "https://app.example/path" },
  { origin: "https://user:password@app.example" },
  { origin: "https://app.example, https://evil.example" },
  { origin: "https://evil.example", referer: "https://app.example/safe" },
  { referer: "https://evil.example/path" },
  { referer: "not a URL" },
  { referer: "https://user:password@app.example/path" },
  { origin: "https://app.example", "sec-fetch-site": "cross-site" },
];
test.each(invalidSources)(
  "rejects unsafe browser metadata %j with one public failure",
  (headers) => {
    expect(() => assertSameOrigin(write(headers), { origin: "https://app.example" })).toThrow(
      "Access denied",
    );
  },
);

test("explicit missing-origin exemptions still reject supplied hostile metadata", () => {
  const options = { origin: "https://app.example", allowMissingOrigin: true };
  expect(() => assertSameOrigin(write(), options)).not.toThrow();
  expect(() => assertSameOrigin(write({ origin: "https://evil.example" }), options)).toThrow(
    "Access denied",
  );
  expect(() => assertSameOrigin(write({ "sec-fetch-site": "cross-site" }), options)).toThrow(
    "Access denied",
  );
});

test("rejects invalid runtime policy configuration", () => {
  for (const origin of [
    "file:///tmp/app",
    "https://app.example/path",
    "https://user@app.example",
    "https://app.example?secret=value",
  ])
    expect(() => createSameOriginGuard({ origin })).toThrow("canonical");
  for (const limit of [0, -1, 1.5, Infinity])
    expect(() => createRateLimiter({ limit, windowMs: 1000 })).toThrow("positive integer");
  expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow("positive integer");
  expect(() => createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 0 })).toThrow(
    "positive integer",
  );
  expect(() => createRateLimiter({ limit: 1, windowMs: 1000 }).consume("a".repeat(257))).toThrow(
    "key",
  );
});
