import { paginationSchema } from "@raypx/contracts/pagination";
import { apiErrorResponseSchema } from "@raypx/contracts/errors";
import { createLogger, type LogRecord } from "@raypx/logger";
import { expect, test, vi } from "vite-plus/test";
import {
  withHttpRequest,
  HttpError,
  parseJsonBody,
  getRequestContext,
  type RequestObservation,
} from "../src/http.js";

function request(path = "/api/example", requestId?: string) {
  return new Request(`http://localhost${path}`, {
    headers: requestId ? { "x-request-id": requestId } : {},
  });
}

test("correlates the response, handler context and access log without query credentials", async () => {
  const records: LogRecord[] = [];
  const logger = createLogger({ sink: (record) => records.push(record) });
  const observe = vi.fn<(observation: RequestObservation) => void>();
  const response = await withHttpRequest(
    request("/api/example?token=secret-sentinel", "request-1"),
    (context) => {
      expect(getRequestContext()).toBe(context);
      context.logger.info("inside");
      return Response.json({ ok: true });
    },
    { logger, observe },
  );
  expect(response.headers.get("x-request-id")).toBe("request-1");
  expect(records.every((record) => record.requestId === "request-1")).toBe(true);
  expect(JSON.stringify(records)).not.toContain("secret-sentinel");
  expect(observe).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ status: 200, requestId: "request-1" }),
  );
  expect(getRequestContext()).toBeUndefined();
});

test("replaces invalid incoming request IDs", async () => {
  const response = await withHttpRequest(request("/api/example", "a".repeat(129)), () =>
    Response.json({}),
  );
  expect(response.headers.get("x-request-id")).toMatch(/^[a-f\d-]{36}$/);
});

test("maps deliberate errors and keeps unexpected errors private", async () => {
  const expected = await withHttpRequest(request(), () => {
    throw new HttpError("FORBIDDEN");
  });
  expect(expected.status).toBe(403);
  expect(apiErrorResponseSchema.parse(await expected.json()).error.code).toBe("FORBIDDEN");
  const records: LogRecord[] = [];
  const unexpected = await withHttpRequest(
    request(),
    () => {
      throw new Error("private-sentinel");
    },
    {
      logger: createLogger({ sink: (record) => records.push(record) }),
    },
  );
  expect(unexpected.status).toBe(500);
  expect(await unexpected.text()).not.toContain("private-sentinel");
  expect(records.find((record) => record.level === "error")?.error).toMatchObject({
    message: "private-sentinel",
  });
});

test("sanitizes framework API 500 responses and tolerates an unavailable observer", async () => {
  const response = await withHttpRequest(
    request(),
    () => new Response("private-stack", { status: 500 }),
    {
      observe: () => {
        throw new Error("observer failed");
      },
    },
  );
  expect(response.status).toBe(500);
  expect(apiErrorResponseSchema.parse(await response.json()).error.code).toBe("INTERNAL_ERROR");
});

test("keeps concurrent contexts isolated", async () => {
  await Promise.all(
    ["first", "second"].map((id) =>
      withHttpRequest(request("/", id), async () => {
        await new Promise((resolve) => setTimeout(resolve, id === "first" ? 5 : 0));
        expect(getRequestContext()?.requestId).toBe(id);
        return new Response("ok");
      }),
    ),
  );
});

test("route boundaries preserve domain failures and emit one correlated access log", async () => {
  const records: LogRecord[] = [];
  const incoming = request("/api/example", "nested-request");
  const response = await withHttpRequest(
    incoming,
    () =>
      withHttpRequest(incoming, (context) => {
        expect(context.requestId).toBe("nested-request");
        throw new HttpError("VALIDATION_ERROR", { name: ["Required"] });
      }),
    { logger: createLogger({ sink: (record) => records.push(record) }) },
  );
  expect(response.status).toBe(400);
  expect(apiErrorResponseSchema.parse(await response.json()).error).toMatchObject({
    code: "VALIDATION_ERROR",
    requestId: "nested-request",
    errors: { name: ["Required"] },
  });
  expect(records.filter((record) => record.message === "Request completed")).toHaveLength(1);
});

test("normalizes malformed and invalid JSON into validation failures", async () => {
  await expect(
    parseJsonBody(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      paginationSchema,
    ),
  ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  await expect(
    parseJsonBody(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: 0, pageSize: 200 }),
      }),
      paginationSchema,
    ),
  ).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
    errors: {
      page: expect.any(Array),
      pageSize: expect.any(Array),
    },
  });
  await expect(
    parseJsonBody(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page: 2, pageSize: 10 }),
      }),
      paginationSchema,
    ),
  ).resolves.toEqual({ page: 2, pageSize: 10 });
});
