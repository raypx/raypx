import { paginationSchema } from "@raypx/contracts/pagination";
import { apiErrorResponseSchema } from "@raypx/contracts/errors";
import { createLogger } from "@raypx/logger";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { readRequestBody, parseJsonBody, withHttpRequest } from "../src/http.js";

const encoder = new TextEncoder();
const logger = createLogger({ level: "silent" });
const json = (body: string, contentType = "application/json") =>
  new Request("http://localhost/api/body", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
function streaming(
  body: ReadableStream<Uint8Array>,
  headers: HeadersInit = {},
  signal?: AbortSignal,
) {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body,
    headers,
    signal,
    duplex: "half",
  };
  return new Request("http://localhost/api/body", init);
}
afterEach(() => vi.useRealTimers());

test("counts original UTF-8 bytes at the exact limit without decoding raw provider input", async () => {
  const input = "é\r\n\u0000";
  const bytes = encoder.encode(input);
  expect(await readRequestBody(json(input), { maxBytes: bytes.byteLength })).toEqual(bytes);
  await expect(
    readRequestBody(json(input), { maxBytes: bytes.byteLength - 1 }),
  ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", status: 413 });
});

const lengthHeaders: Record<string, string>[] = [{}, { "content-length": "1" }];
test.each(lengthHeaders)(
  "counts chunks despite absent or understated Content-Length %j",
  async (headers) => {
    let position = 0;
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (position++ < 3) controller.enqueue(encoder.encode("ab"));
          else controller.close();
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const incoming = streaming(body, headers);
    await expect(readRequestBody(incoming, { maxBytes: 5 })).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  },
);

test("rejects declared oversized bodies before pulling or invoking business work", async () => {
  const pull = vi.fn<() => void>();
  const cancel = vi.fn<(reason?: unknown) => void>();
  const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  const work = vi.fn<() => void>();
  const incoming = streaming(body, { "content-length": "100" });
  const response = await withHttpRequest(
    incoming,
    async () => {
      await readRequestBody(incoming, { maxBytes: 10 });
      work();
      return new Response();
    },
    { logger },
  );
  expect(response.status).toBe(413);
  expect(apiErrorResponseSchema.parse(await response.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  expect(pull).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledOnce();
  expect(work).not.toHaveBeenCalled();
});

test("read deadlines cancel and release even when the source cancellation never settles", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn<() => Promise<void>>(() => new Promise<void>(() => undefined));
  const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
  const reading = readRequestBody(streaming(body), { timeoutMs: 10 });
  const assertion = (async () => {
    await expect(reading).rejects.toMatchObject({ code: "REQUEST_TIMEOUT", status: 408 });
  })();
  await vi.advanceTimersByTimeAsync(10);
  await assertion;
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

test("native and independent caller aborts remain AbortErrors and release timers", async () => {
  vi.useFakeTimers();
  for (const source of ["native", "caller"]) {
    const controller = new AbortController();
    const cancel = vi.fn<(reason?: unknown) => void>();
    const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
    const reading = readRequestBody(
      streaming(body, {}, source === "native" ? controller.signal : undefined),
      {
        signal: source === "caller" ? controller.signal : undefined,
      },
    );
    const assertion = (async () => {
      await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    })();
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  }
  const preAborted = AbortSignal.abort();
  await expect(readRequestBody(json("{}"), { signal: preAborted })).rejects.toMatchObject({
    name: "AbortError",
  });
});

test("finished reads clear their deadline, reject invalid options and detect double consumption", async () => {
  vi.useFakeTimers();
  const incoming = json("{}");
  await readRequestBody(incoming);
  expect(vi.getTimerCount()).toBe(0);
  await expect(readRequestBody(incoming)).rejects.toThrow("already been consumed");
  for (const maxBytes of [0, -1, 1.5, Infinity, 67_108_865])
    await expect(readRequestBody(json("{}"), { maxBytes })).rejects.toThrow("Body limit");
  for (const timeoutMs of [0, -1, 1.5, Infinity, 120_001])
    await expect(readRequestBody(json("{}"), { timeoutMs })).rejects.toThrow("Body deadline");
});

test.each([
  "application/json",
  "Application/JSON; charset=utf-8",
  "application/problem+json",
  "application/vnd.raypx+json; charset=UTF-8",
])("parses accepted JSON media type %s", async (type) => {
  expect(await parseJsonBody(json('{"page":2}', type), paginationSchema)).toMatchObject({
    page: 2,
  });
});

test.each([undefined, "text/plain", "multipart/form-data", "text/json"])(
  "rejects non-JSON media type %s before consuming",
  async (type) => {
    const incoming = new Request("http://localhost/api/body", {
      method: "POST",
      body: encoder.encode("{}"),
      headers: type ? { "content-type": type } : undefined,
    });
    await expect(parseJsonBody(incoming, paginationSchema)).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      status: 415,
    });
    expect(incoming.bodyUsed).toBe(false);
  },
);

test("distinguishes malformed JSON/UTF-8 from unknown source failures", async () => {
  await expect(parseJsonBody(json("{"), paginationSchema)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
  const invalid = new Request("http://localhost/api/body", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new Uint8Array([0xff]),
  });
  await expect(parseJsonBody(invalid, paginationSchema)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
  const failure = new Error("source-failure");
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.error(failure);
      },
    },
    { highWaterMark: 0 },
  );
  await expect(readRequestBody(streaming(body))).rejects.toBe(failure);
  expect(body.locked).toBe(false);
});
