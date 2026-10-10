import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { apiErrorResponseSchema } from "@raypx/contracts/errors";
import { createLogger } from "@raypx/logger";
import { beforeAll, expect, test, vi } from "vite-plus/test";
import {
  HttpError,
  isHttpError,
  withHttpRequest,
  type RequestObservation,
  type RequestLifecycleEvent,
} from "../src/http.js";

let foreignSecurity: typeof import("../src/security.js");
let foreignHttp: typeof import("../src/http.js");
const logger = createLogger({ level: "silent" });

beforeAll(async () => {
  // Compile the real modules independently, as Nitro and Start do. No artifact
  // is written and these imports cannot accidentally reuse the test's class.
  const source = execFileSync(
    "bun",
    [
      "--no-env-file",
      "-e",
      `
    const entries = {security:"packages/api/src/security.ts",http:"packages/api/src/http.ts"};
    const compiled = {};
    for (const [name,path] of Object.entries(entries)) {
      const result = await Bun.build({entrypoints:[path],target:"node",write:false});
      if (!result.success) throw new Error("Cross-bundle fixture failed to compile");
      compiled[name] = Buffer.from(await result.outputs[0].text()).toString("base64");
    }
    process.stdout.write(JSON.stringify(compiled));
  `,
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const compiled = JSON.parse(source) as { security: string; http: string };
  foreignSecurity = (await import(
    `data:text/javascript;base64,${compiled.security}`
  )) as typeof foreignSecurity;
  foreignHttp = (await import(
    `data:text/javascript;base64,${compiled.http}`
  )) as typeof foreignHttp;
});

test("a real independently bundled origin guard remains a correlated 403 inside a nested boundary", async () => {
  const incoming = new Request("https://app.example/api/auth/sign-out", {
    method: "POST",
    headers: { origin: "https://evil.example", "x-request-id": "cross-bundle-origin" },
  });
  const handler = vi.fn<() => Response>(() => new Response("side effect"));
  const observe = vi.fn<(event: RequestObservation) => void>();
  const response = await withHttpRequest(
    incoming,
    () =>
      withHttpRequest(incoming, handler, {
        guards: [foreignSecurity.createSameOriginGuard({ origin: "https://app.example" })],
      }),
    { logger, observe },
  );
  expect(response.status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
  expect(apiErrorResponseSchema.parse(await response.json()).error).toEqual({
    code: "FORBIDDEN",
    message: "Access denied",
    requestId: "cross-bundle-origin",
  });
  expect(response.headers.get("x-request-id")).toBe("cross-bundle-origin");
  expect(observe).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 403 }));
});

test("a real independently bundled rate guard preserves 429 and public quota headers", async () => {
  const guard = foreignSecurity.createRateLimitGuard({
    limiter: foreignSecurity.createRateLimiter({ limit: 1, windowMs: 2000, now: () => 1000 }),
  });
  const request = () =>
    new Request("http://localhost/api/items", { headers: { "x-request-id": "cross-bundle-rate" } });
  expect(
    (await withHttpRequest(request(), () => new Response("ok"), { logger, guards: [guard] }))
      .status,
  ).toBe(200);
  const response = await withHttpRequest(request(), () => new Response("unreachable"), {
    logger,
    guards: [guard],
  });
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("2");
  expect(response.headers.get("x-ratelimit-limit")).toBe("1");
  expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
  expect(response.headers.get("x-ratelimit-reset")).toBe("3");
  expect(apiErrorResponseSchema.parse(await response.json()).error.code).toBe("RATE_LIMITED");
});

test("foreign deliberate validation errors retain legal field messages", async () => {
  const error = new foreignHttp.HttpError(
    "VALIDATION_ERROR",
    { email: ["Enter an email"] },
    { headers: { "x-public-policy": "validation" } },
  );
  expect(error).not.toBeInstanceOf(HttpError);
  expect(isHttpError(error)).toBe(true);
  const response = await withHttpRequest(
    new Request("http://localhost/api/items"),
    () => {
      throw error;
    },
    { logger },
  );
  expect(response.status).toBe(400);
  expect(response.headers.get("x-public-policy")).toBe("validation");
  expect(apiErrorResponseSchema.parse(await response.json()).error.errors).toEqual({
    email: ["Enter an email"],
  });
});

test("ordinary objects and forged Error brands cannot become deliberate public failures", () => {
  const brand = Symbol.for("@raypx/api/http-error/v1");
  const shape = {
    [brand]: true,
    name: "HttpError",
    message: "Access denied",
    code: "FORBIDDEN",
    status: 403,
    headers: new Headers(),
  };
  expect(isHttpError(shape)).toBe(false);
  expect(isHttpError(Object.assign(new Error("Access denied"), shape))).toBe(false);
  const accessor = new HttpError("FORBIDDEN");
  Object.defineProperty(accessor, "message", { get: () => "Access denied" });
  expect(isHttpError(accessor)).toBe(false);
});

test("tampering with a minted error's public code, status, message, headers or fields becomes a safe 500", async () => {
  const changes: readonly (readonly [PropertyKey, unknown])[] = [
    ["code", "PRIVATE_CODE"],
    ["status", 500],
    ["message", "private-sentinel"],
    ["headers", {}],
    ["errors", { email: [] }],
    ["name", "ForeignError"],
    [Symbol.for("@raypx/api/http-error/v1"), false],
  ];
  for (const [key, value] of changes) {
    const error = new HttpError("FORBIDDEN");
    Object.defineProperty(error, key, { value });
    expect(isHttpError(error)).toBe(false);
    const response = await withHttpRequest(
      new Request("http://localhost/api/items"),
      () => {
        throw error;
      },
      { logger },
    );
    expect(response.status).toBe(500);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
  }
});

test("independently bundled nested lifecycle shares context, cancellation and one finalizer", async () => {
  const caller = new AbortController();
  const events: RequestLifecycleEvent[] = [];
  const incoming = new Request("http://localhost/stream");
  const response = await withHttpRequest(
    incoming,
    () =>
      foreignHttp.withHttpRequest(
        incoming,
        (context) =>
          new Response(
            new ReadableStream<Uint8Array>(
              {
                pull() {
                  expect(foreignHttp.getRequestContext()).toBe(context);
                },
              },
              { highWaterMark: 0 },
            ),
          ),
        { signal: caller.signal, route: "/stream" },
      ),
    {
      logger,
      observeLifecycle: (event) => {
        events.push(event);
      },
    },
  );
  const reading = response.body!.getReader().read();
  const assertion = (async () => {
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  })();
  caller.abort();
  await assertion;
  expect(events).toEqual([
    expect.objectContaining({ phase: "response-ready", route: "/stream" }),
    expect.objectContaining({ phase: "response-finished", route: "/stream", outcome: "cancelled" }),
  ]);
});
