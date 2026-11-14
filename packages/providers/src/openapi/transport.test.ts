import { expect, it, vi } from "vitest";
import { type OpenApiTransportOptions, createOpenApiTransport } from "./transport.js";
import { parseOpenApiDocument } from "./document.js";
const operation = parseOpenApiDocument(
  JSON.stringify({
    openapi: "3.1.0",
    paths: {
      "/items/{id}": {
        get: {
          operationId: "read",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "query", in: "query", schema: { type: "string" } },
          ],
        },
      },
    },
  }),
)[0]!;
const signal = new AbortController().signal;
it("pins admitted DNS address and registered host/path, with encoded parameters", async () => {
  const request = vi.fn<NonNullable<OpenApiTransportOptions["request"]>>(async () => ({
    status: 200,
    headers: new Headers(),
    body: "outside result",
  }));
  const transport = createOpenApiTransport({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    request,
  });
  expect(
    await transport.call(
      "https://api.example.test/v1",
      {},
      operation,
      { path: { id: "https://other.test/a" }, query: { query: "value" } },
      signal,
    ),
  ).toMatchObject({ content: "outside result", isError: false });
  expect(request.mock.calls[0]?.[0]).toMatchObject({ address: "93.184.216.34", family: 4 });
  const endpoint = request.mock.calls[0]?.[0] as unknown as { url: URL };
  expect(endpoint.url.origin).toBe("https://api.example.test");
  expect(endpoint.url.pathname).toBe("/v1/items/https%3A%2F%2Fother.test%2Fa");
  expect(endpoint.url.search).toBe("?query=value");
});
it.each(["fetch", "test", "call"])(
  "refuses private/rebinding DNS before dispatch on %s",
  async (kind) => {
    const request = vi.fn();
    const transport = createOpenApiTransport({
      resolver: async () => [{ address: "10.0.0.1", family: 4 }],
      request,
    });
    const url = "https://public.example.test";
    function perform() {
      if (kind === "fetch") return transport.fetchDocument(url, signal);
      if (kind === "test") return transport.test(url, {}, signal);
      return transport.call(url, {}, operation, { path: { id: "one" } }, signal);
    }
    const promise = perform();
    await expect(promise).rejects.toMatchObject({ code: "INVALID_ENDPOINT" });
    expect(request).not.toHaveBeenCalled();
  },
);
it.each([
  "http://10.0.0.1",
  "https://169.254.169.254",
  "https://[::ffff:127.0.0.1]",
  "https://user:password@api.test",
  "https://api.test/?token=x",
])("refuses unsafe endpoint %s", (url) => {
  expect(() => createOpenApiTransport().validate(url)).toThrow("INVALID_ENDPOINT");
});
it("refuses redirects before another dispatch and bounds responses including escaped credential echoes", async () => {
  const request = vi.fn<NonNullable<OpenApiTransportOptions["request"]>>(async () => ({
    status: 307,
    headers: new Headers({ location: "https://other.example.test" }),
    body: "",
  }));
  const transport = createOpenApiTransport({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    request,
  });
  await expect(transport.test("https://api.test", {}, signal)).rejects.toMatchObject({
    code: "INVALID_ENDPOINT",
  });
  expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValue({ status: 200, headers: new Headers(), body: "x".repeat(262145) });
  await expect(transport.fetchDocument("https://api.test", signal)).rejects.toMatchObject({
    code: "REQUEST_FAILED",
  });
  const token = 'escaped-"-token';
  request.mockResolvedValue({
    status: 200,
    headers: new Headers(),
    body: JSON.stringify({ echoed: token }),
  });
  await expect(
    transport.call(
      "https://api.test",
      { authorization: `Bearer ${token}` },
      operation,
      { path: { id: "one" } },
      signal,
    ),
  ).rejects.toMatchObject({ code: "REQUEST_FAILED" });
});
it("rejects malformed arguments before dispatch and truncates successful response content", async () => {
  const request = vi.fn<NonNullable<OpenApiTransportOptions["request"]>>(async () => ({
    status: 200,
    headers: new Headers(),
    body: "x".repeat(20000),
  }));
  const transport = createOpenApiTransport({
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    request,
  });
  await expect(
    transport.call("https://api.test", {}, operation, { path: { id: ".." } }, signal),
  ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  expect(request).not.toHaveBeenCalled();
  const result = await transport.call(
    "https://api.test",
    {},
    operation,
    { path: { id: "one" } },
    signal,
  );
  expect(result.content).toHaveLength(12000);
  expect(result.truncated).toBe(true);
});
it("respects deadlines and cancellation without raw errors", async () => {
  const transport = createOpenApiTransport({
    timeoutMs: 5,
    resolver: async () => new Promise(() => {}),
  });
  await expect(transport.test("https://api.test", {}, signal)).rejects.toMatchObject({
    code: "TIMED_OUT",
  });
});
