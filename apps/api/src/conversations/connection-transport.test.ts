import { afterEach, expect, it, vi } from "vitest";
import * as ai from "@raypx/ai";
import type { AiClient, AiStream, AssistantMessage, AssistantMessageEvent } from "@raypx/ai";
import type { ModelConnection, ModelConnectionConfiguration } from "@raypx/core/model-connections";
import { createConnectionTransport } from "./connection-transport.js";

const credential = "member-transport-private-test-key";
const configuration: ModelConnectionConfiguration = {
  name: "Endpoint",
  kind: "compatible",
  baseUrl: "https://models.example.test/v1",
  api: "openai-completions",
  models: ["model-a"],
  availability: { mode: "all" },
};
const connection: ModelConnection = {
  ...configuration,
  id: "00000000-0000-4000-8000-000000000001",
  createdAt: "2026-11-14T00:00:00.000Z",
  updatedAt: "2026-11-14T00:00:00.000Z",
};
afterEach(() => {
  vi.restoreAllMocks();
});
function assistant(text = "Safe reply"): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "member-connection",
    model: "model-a",
    stopReason: "stop",
    timestamp: 0,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}
function fakeClient(message = assistant(), events?: AssistantMessageEvent[]) {
  const complete = vi.fn<AiClient["complete"]>(async () => message);
  const stream = vi.fn<AiClient["stream"]>((): AiStream => ({
    result: async () => message,
    async *[Symbol.asyncIterator]() {
      if (events) {
        for (const event of events) yield event;
      } else yield { type: "done", reason: "stop", message } as const;
    },
  }));
  const client = {
    complete,
    stream,
    close: vi.fn(),
    resolveModel: vi.fn(() => ({
      api: "openai-completions",
      provider: "member-connection",
      id: "model-a",
      input: ["text"],
    })),
  };
  vi.spyOn(ai, "createAiClient").mockReturnValue(client as unknown as AiClient);
  return client;
}

it("validates compatible and all built-in kinds against the offline catalog without dispatch", () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("Network forbidden");
  });
  const client = ai.createAiClient();
  const transport = createConnectionTransport();
  try {
    transport.validate(configuration);
    for (const kind of ["anthropic", "openai", "google", "openrouter"] as const) {
      const model = client.models(kind)[0];
      expect(model).toBeDefined();
      transport.validate({ ...configuration, kind, baseUrl: null, api: null, models: [model!.id] });
    }
    expect(() =>
      transport.validate({
        ...configuration,
        baseUrl: "https://name:password@models.example.test/v1",
      }),
    ).toThrow("AI configuration is invalid.");
    expect(() =>
      transport.validate({ ...configuration, baseUrl: "http://models.example.test/v1" }),
    ).toThrow("AI configuration is invalid.");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    transport.close();
    client.close();
  }
});

it.each([
  ["AI_AUTH_REQUIRED", "AUTHENTICATION_FAILED"],
  ["AI_RATE_LIMITED", "RATE_LIMITED"],
  ["AI_TIMEOUT", "TIMED_OUT"],
  ["AI_MODEL_NOT_FOUND", "MODEL_UNAVAILABLE"],
  ["AI_REQUEST_FAILED", "REQUEST_FAILED"],
  ["AI_INVALID_CONFIG", "REQUEST_FAILED"],
  ["AI_ABORTED", "REQUEST_FAILED"],
  ["AI_CLOSED", "REQUEST_FAILED"],
] as const)(
  "maps %s to stable test outcome %s in one bounded request",
  async (failureCode, expected) => {
    const client = fakeClient();
    client.complete.mockRejectedValueOnce(new ai.AiError(failureCode));
    const transport = createConnectionTransport();
    const outcome = await transport.test(connection, "model-a", credential);
    expect(outcome).toEqual({ code: expected });
    expect(client.complete).toHaveBeenCalledExactlyOnceWith(
      { provider: "member-connection", model: "model-a" },
      { messages: [{ role: "user", content: "Reply OK.", timestamp: 0 }] },
      expect.objectContaining({ apiKey: credential, env: {}, maxTokens: 1, timeoutMs: 10_000 }),
    );
    expect(client.close).toHaveBeenCalledOnce();
    expect(JSON.stringify(outcome)).not.toContain(credential);
    transport.close();
  },
);

it("sanitizes arbitrary provider failures and reports a successful bounded test", async () => {
  const client = fakeClient();
  const transport = createConnectionTransport();
  client.complete.mockRejectedValueOnce(new Error(`private provider error ${credential}`));
  const failure = await transport.test(connection, "model-a", credential);
  expect(failure).toEqual({ code: "REQUEST_FAILED" });
  expect(JSON.stringify(failure)).not.toContain(credential);
  expect(await transport.test(connection, "model-a", credential)).toEqual({ code: "SUCCEEDED" });
  expect(client.complete).toHaveBeenCalledTimes(2);
  transport.close();
});

it.each([
  {
    api: "openai-responses",
    path: "/api/v1/responses",
    status: 200,
    body: { code: 1001, msg: credential, success: false },
    headers: { "ga-traceid": "bigmodel-trace-1" },
    expected: {
      code: "REQUEST_FAILED",
      providerCode: "1001",
      providerRequestId: "bigmodel-trace-1",
    },
  },
  {
    api: "openai-responses",
    path: "/api/v1/responses",
    status: 400,
    body: { error: { code: "1210", message: credential }, request_id: "glm-request-1" },
    headers: { "x-request-id": "gateway-request" },
    expected: { code: "REQUEST_FAILED", providerCode: "1210", providerRequestId: "glm-request-1" },
  },
  {
    api: "anthropic-messages",
    path: "/api/anthropic/v1/messages",
    status: 403,
    body: { type: "error", error: { type: "permission_error", code: 1002, message: credential } },
    headers: { "request-id": "glm-request-2" },
    expected: {
      code: "AUTHENTICATION_FAILED",
      providerCode: "1002",
      providerRequestId: "glm-request-2",
    },
  },
  {
    api: "openai-responses",
    path: "/api/v1/responses",
    status: 400,
    body: {
      error: { code: Buffer.from(credential).toString("base64url"), message: "private message" },
      request_id: `req-${credential}`,
    },
    headers: { "x-request-id": "invalid request ID" },
    expected: { code: "REQUEST_FAILED" },
  },
] as const)("returns only allowed diagnostics from $api upstream failures", async (fixture) => {
  const serve = vi.fn((request: Request) => {
    expect(new URL(request.url).pathname).toBe(fixture.path);
    return Response.json(fixture.body, { status: fixture.status, headers: fixture.headers });
  });
  const endpoint = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: serve });
  const transport = createConnectionTransport();
  const basePath = fixture.api === "anthropic-messages" ? "api/anthropic" : "api/v1";
  try {
    const result = await transport.test(
      { ...connection, api: fixture.api, baseUrl: new URL(basePath, endpoint.url).href },
      "model-a",
      credential,
    );
    expect(result).toEqual(fixture.expected);
    expect(serve).toHaveBeenCalledOnce();
  } finally {
    transport.close();
    await endpoint.stop(true);
  }
});

it("reports a Responses error event with its request ID header", async () => {
  const event = {
    type: "response.failed",
    response: { error: { code: "1305", message: credential } },
  };
  const endpoint = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(`event: response.failed\ndata: ${JSON.stringify(event)}\n\n`, {
        headers: { "content-type": "text/event-stream", "x-request-id": "glm-stream-1" },
      }),
  });
  const transport = createConnectionTransport();
  try {
    expect(
      await transport.test(
        { ...connection, api: "openai-responses", baseUrl: new URL("api/v1", endpoint.url).href },
        "model-a",
        credential,
      ),
    ).toEqual({ code: "REQUEST_FAILED", providerCode: "1305", providerRequestId: "glm-stream-1" });
  } finally {
    transport.close();
    await endpoint.stop(true);
  }
});

it("keeps credentials out of streamed model events and results", async () => {
  const client = fakeClient();
  const transport = createConnectionTransport();
  const resolved = await transport.resolve(connection, "model-a", credential);
  const stream = resolved.stream(
    { instructions: "Answer briefly", history: [] },
    new AbortController().signal,
  );
  const events = [];
  for await (const event of stream) events.push(event);
  const result = await stream.result();
  expect(JSON.stringify([events, result])).not.toContain(credential);
  expect(client.stream).toHaveBeenCalledOnce();
  expect(client.stream.mock.calls[0]?.[2]).toMatchObject({
    apiKey: credential,
    env: {},
    timeoutMode: "stream-idle",
  });
  expect(client.close).toHaveBeenCalled();
  transport.close();
});

it.each([credential, "private\ncredential\\with-escapes"])(
  "refuses credential echoes in provider stream results and events before exposing them",
  async (testCredential) => {
    const unsafe = assistant(testCredential);
    const client = fakeClient(unsafe);
    const transport = createConnectionTransport();
    const resolved = await transport.resolve(connection, "model-a", testCredential);
    const stream = resolved.stream(
      { instructions: "Answer briefly", history: [] },
      new AbortController().signal,
    );
    const result = await stream.result().catch((error: unknown) => error);
    expect(result).toMatchObject({ code: "AI_REQUEST_FAILED" });
    expect(JSON.stringify(result)).not.toContain(credential);
    const events: AssistantMessageEvent[] = [];
    const failure = await (async () => {
      for await (const event of stream) events.push(event);
    })().catch((error: unknown) => error);
    expect(events).toEqual([]);
    expect(failure).toMatchObject({ code: "AI_REQUEST_FAILED" });
    expect(JSON.stringify(failure)).not.toContain(credential);
    expect(client.close).toHaveBeenCalled();
    transport.close();
  },
);

it("refuses credentials in model history before sending or persisting provider output", async () => {
  const client = fakeClient();
  const transport = createConnectionTransport();
  const resolved = await transport.resolve(connection, "model-a", credential);
  expect(() =>
    resolved.stream(
      { instructions: `Untrusted content ${credential}`, history: [] },
      new AbortController().signal,
    ),
  ).toThrow("The AI request failed.");
  expect(client.stream).not.toHaveBeenCalled();
  expect(client.close).toHaveBeenCalledTimes(2);
  transport.close();
});
