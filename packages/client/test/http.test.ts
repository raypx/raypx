import { healthResponseSchema } from "@raypx/contracts/health";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { ApiClientError } from "@raypx/client/errors";
import { requestJson, type JsonValue } from "@raypx/client/http";

const healthyResponse = { status: "ok", service: "raypx-api" } as const;
const options = { path: "/api/health", schema: healthResponseSchema };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("sends same-origin credentials and safely serialized JSON", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(healthyResponse));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    requestJson({ ...options, method: "POST", body: { text: 'quote"\n', enabled: true } }),
  ).resolves.toEqual(healthyResponse);
  const init = fetchMock.mock.calls[0]?.[1];
  expect(init).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    mode: "same-origin",
    body: '{"text":"quote\\\"\\n","enabled":true}',
  });
  expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  expect(new Headers(init?.headers).get("accept")).toBe("application/json");
});

test.each([
  "https://other.example/api",
  "//other.example/api",
  "/\\other.example/api",
  "api/health",
  "/api/health#fragment",
])("rejects unsafe path %s before fetching", async (path) => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  await expect(requestJson({ ...options, path })).rejects.toMatchObject({
    kind: "invalid-request",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects cyclic and non-finite request values before sending", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const cyclic: { [key: string]: JsonValue } = {};
  cyclic.self = cyclic;
  for (const body of [cyclic, { value: Number.NaN }, { value: Number.POSITIVE_INFINITY }]) {
    await expect(requestJson({ ...options, method: "POST", body })).rejects.toMatchObject({
      kind: "invalid-request",
    });
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test("retains typed server errors, field messages, and request ID", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Check the submitted fields",
            requestId: "request-123",
            errors: { email: ["Invalid email"] },
          },
        },
        { status: 400 },
      ),
    ),
  );
  await expect(requestJson(options)).rejects.toMatchObject({
    name: "ApiClientError",
    kind: "http",
    status: 400,
    code: "VALIDATION_ERROR",
    requestId: "request-123",
    errors: { email: ["Invalid email"] },
  });
});

test("uses a safe request ID response header when the error payload omits it", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: "NOT_FOUND", message: "Resource not found" } },
          { status: 404, headers: { "x-request-id": "header-123" } },
        ),
      ),
  );
  await expect(requestJson(options)).rejects.toMatchObject({
    kind: "http",
    status: 404,
    requestId: "header-123",
  });
});

test.each([
  new Response("private proxy diagnostics", {
    status: 502,
    headers: { "content-type": "text/html" },
  }),
  Response.json({ message: "private database failure" }, { status: 500 }),
  new Response("malformed JSON", { status: 200, headers: { "content-type": "application/json" } }),
  Response.json({ status: "invalid", service: "raypx-api" }),
])("rejects invalid responses without exposing raw body messages", async (response) => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
  const error = await requestJson(options).catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(ApiClientError);
  expect(error).toMatchObject({ kind: "invalid-response", status: response.status });
  expect((error as ApiClientError).message).not.toMatch(/private|database|proxy diagnostics/);
});

test("wraps network failures and does not retry by default", async () => {
  const cause = new TypeError("Failed to fetch");
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(cause);
  vi.stubGlobal("fetch", fetchMock);
  await expect(requestJson(options)).rejects.toMatchObject({ kind: "network", cause });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("retries transient read failures only when explicitly enabled", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: "SERVICE_UNAVAILABLE", message: "Service unavailable" } },
        { status: 503 },
      ),
    )
    .mockResolvedValueOnce(Response.json(healthyResponse));
  vi.stubGlobal("fetch", fetchMock);
  await expect(requestJson({ ...options, retry: { maxRetries: 2, delayMs: 0 } })).resolves.toEqual(
    healthyResponse,
  );
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test("HEAD retries use status without requiring an HTTP response body", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const schema = {
    parse(value: unknown) {
      if (value !== undefined) throw new Error("Expected an empty response");
      return undefined;
    },
  };
  await expect(
    requestJson({
      path: "/api/health",
      method: "HEAD",
      schema,
      retry: { maxRetries: 1, delayMs: 0 },
    }),
  ).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("a single timeout deadline covers retry delays", async () => {
  const timeoutController = new AbortController();
  const timeoutMock = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  const request = requestJson({
    ...options,
    timeoutMs: 100,
    retry: { maxRetries: 2, delayMs: 1000 },
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  timeoutController.abort(new DOMException("Deadline reached", "TimeoutError"));
  await expect(request).rejects.toMatchObject({ kind: "timeout", name: "TimeoutError" });
  expect(timeoutMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("bounds retry attempts and does not retry invalid contracts", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    requestJson({ ...options, retry: { maxRetries: 2, delayMs: 0 } }),
  ).rejects.toMatchObject({ kind: "network" });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  fetchMock
    .mockReset()
    .mockResolvedValue(Response.json({ error: "bad contract" }, { status: 503 }));
  await expect(
    requestJson({ ...options, retry: { maxRetries: 2, delayMs: 0 } }),
  ).rejects.toMatchObject({ kind: "invalid-response" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("never retries writes and rejects explicit write retry settings", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  await expect(requestJson({ ...options, method: "POST", body: {} })).rejects.toMatchObject({
    kind: "network",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(
    requestJson({ ...options, method: "POST", retry: { maxRetries: 1 } }),
  ).rejects.toMatchObject({ kind: "invalid-request" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("caller cancellation interrupts retry delay and prevents further fetches", async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  const request = requestJson({
    ...options,
    signal: controller.signal,
    retry: { maxRetries: 2, delayMs: 1000 },
  });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  controller.abort();
  await expect(request).rejects.toMatchObject({ kind: "aborted", name: "AbortError" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
