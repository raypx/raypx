import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createApiClient } from "@raypx/client";
import type { AuthSession } from "@raypx/auth/types";
import type { SafeEvent } from "@raypx-kit/logger/safe";
import { createApiApp, type ApiAppOptions } from "../../server/api.js";
import { createApiLogging, type ApiLogging } from "../../server/logging.js";

const secret = {
  cookie: "private-cookie-value-71",
  authorization: "private-bearer-value-31",
  query: "private-query-value-41",
  body: "private-body-value-53",
  message: "private-error-message-67",
  cause: "private-error-cause-89",
  forgedId: "forged-client-request-id-97",
  email: "private-account@example.com",
  name: "Private Account Name",
};
const sensitiveHeaders = {
  cookie: `better-auth.session_token=${secret.cookie}`,
  authorization: `Bearer ${secret.authorization}`,
  "x-request-id": secret.forgedId,
};
const session: AuthSession = {
  user: { id: "logging-user", email: secret.email, name: secret.name, emailVerified: true },
  session: {
    id: "logging-session",
    userId: "logging-user",
    expiresAt: new Date(Date.now() + 60000),
  },
};

const events: SafeEvent[] = [];
let logger: ApiLogging | undefined;
let deliveryGate: Promise<void> | undefined;

beforeEach(async () => {
  events.length = 0;
  deliveryGate = undefined;
  logger = createApiLogging({
    service: "raypx-api-test",
    environment: "test",
    sink: async ({ event }) => {
      await deliveryGate;
      events.push(event);
    },
  });
});

afterEach(async () => {
  try {
    await logger?.close();
  } finally {
    logger = undefined;
  }
});

function runtime(): ApiLogging {
  if (!logger) throw new Error("Test logger was not initialized");
  return logger;
}

function app(overrides: Partial<Omit<ApiAppOptions, "logger">> = {}) {
  return createApiApp({
    authHandler: async () => Response.json({ authenticated: true }),
    readSession: async (headers) =>
      headers.get("cookie") === sensitiveHeaders.cookie ? session : null,
    allowedOrigins: ["https://web.example.com"],
    ...overrides,
    logger: runtime(),
  });
}

function clientFor(api: ReturnType<typeof createApiApp>, headers: Record<string, string> = {}) {
  const responses: Response[] = [];
  const client = createApiClient({
    baseUrl: "https://api.example.com",
    headers: { ...sensitiveHeaders, ...headers },
    fetch: async (input, init) => {
      const url = new URL(input);
      url.searchParams.set("token", secret.query);
      const response = await api.fetch(new Request(url, init));
      responses.push(response);
      return response;
    },
  });
  return { client, responses };
}

function onlyResponse(responses: Response[]): Response {
  expect(responses).toHaveLength(1);
  const response = responses[0];
  if (!response) throw new Error("RPC did not return a response");
  return response;
}

function responseId(response: Response): string {
  const id = response.headers.get("x-request-id");
  expect(id).toBeTruthy();
  expect(id).not.toContain(secret.forgedId);
  if (!id) throw new Error("Response omitted its request ID");
  return id;
}

function expectPrivateDataAbsent() {
  const serialized = JSON.stringify(events);
  for (const value of Object.values(secret)) expect(serialized).not.toContain(value);
}

async function expectCompletion(
  response: Response,
  expected: { operation: "http.request" | "rpc.request"; route: string; status: number },
) {
  await runtime().flush();
  expect(response.status).toBe(expected.status);
  expect(events).toHaveLength(1);
  const event = events[0];
  expect(event).toMatchObject({
    ...expected,
    requestId: responseId(response),
    service: "raypx-api-test",
    environment: "test",
  });
  expectPrivateDataAbsent();
  return event;
}

describe("API diagnostic events", () => {
  it("logs health once with a server-owned ID and no request credentials or query", async () => {
    const response = await app().request(`/health?token=${secret.query}`, {
      headers: sensitiveHeaders,
    });
    expect(await response.json()).toEqual({ status: "ok" });
    await expectCompletion(response, { operation: "http.request", route: "/health", status: 200 });
  });

  it("preserves an authentication rejection while excluding headers, body and query", async () => {
    const rejection = { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" };
    const api = app({
      authHandler: async (request) => {
        expect(request.headers.get("cookie")).toBe(sensitiveHeaders.cookie);
        expect(request.headers.get("authorization")).toBe(sensitiveHeaders.authorization);
        expect(new URL(request.url).searchParams.get("token")).toBe(secret.query);
        expect(await request.json()).toEqual({ email: secret.email, password: secret.body });
        return Response.json(rejection, { status: 401 });
      },
    });
    const response = await api.request(`/api/auth/sign-in/email?token=${secret.query}`, {
      method: "POST",
      headers: { ...sensitiveHeaders, "content-type": "application/json" },
      body: JSON.stringify({ email: secret.email, password: secret.body }),
    });
    expect(await response.json()).toEqual(rejection);
    await expectCompletion(response, {
      operation: "http.request",
      route: "/api/auth/*",
      status: 401,
    });
  });

  it("logs an unexpected authentication failure once without its message or cause", async () => {
    const api = app({
      authHandler: async () => {
        throw new Error(secret.message, { cause: new Error(secret.cause) });
      },
    });
    const response = await api.request(`/api/auth/get-session?token=${secret.query}`, {
      headers: sensitiveHeaders,
    });
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_SERVER_ERROR" },
      requestId: responseId(response),
    });
    const event = await expectCompletion(response, {
      operation: "http.request",
      route: "/api/auth/*",
      status: 500,
    });
    expect(event?.error).toBeDefined();
  });

  it("logs a successful RPC once without duplicating Hono events or account data", async () => {
    const { client, responses } = clientFor(app());
    await expect(client.account.get({})).resolves.toEqual({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });
    await expectCompletion(onlyResponse(responses), {
      operation: "rpc.request",
      route: "/rpc/*",
      status: 200,
    });
  });

  it("accepts a Request-compatible wrapper and preserves its streamed RPC input", async () => {
    const controller = new AbortController();
    const body = new TextEncoder().encode(JSON.stringify({ json: { password: secret.body } }));
    const source = new Request(`https://api.example.com/rpc/account/get?token=${secret.query}`, {
      method: "POST",
      headers: { ...sensitiveHeaders, "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(body.subarray(0, 8));
          stream.enqueue(body.subarray(8));
          stream.close();
        },
      }),
      signal: controller.signal,
      duplex: "half",
    });
    let signalReads = 0;
    // Nitro's Node wrapper shares Request.prototype but has no native private state.
    const wrapped: Request = Object.create(Request.prototype, {
      url: { value: source.url },
      method: { value: source.method },
      headers: { value: source.headers },
      body: { value: source.body },
      signal: {
        get() {
          signalReads += 1;
          return source.signal;
        },
      },
    });
    const response = await app().fetch(wrapped);
    expect(await response.json()).toEqual({
      json: { id: session.user.id, email: session.user.email, name: session.user.name },
    });
    expect(source.bodyUsed).toBe(true);
    expect(signalReads).toBeGreaterThan(0);
    expect(source.headers.get("x-request-id")).toBe(secret.forgedId);
    await expectCompletion(response, { operation: "rpc.request", route: "/rpc/*", status: 200 });
  });

  it("preserves the expected RPC error and correlates its request ID with one event", async () => {
    const { client, responses } = clientFor(app({ readSession: async () => null }));
    const error = await client.account.get({}).catch((failure: unknown) => failure);
    const response = onlyResponse(responses);
    expect(error).toMatchObject({
      code: "UNAUTHORIZED",
      data: { error: { code: "AUTH_REQUIRED" }, requestId: responseId(response) },
    });
    await expectCompletion(response, { operation: "rpc.request", route: "/rpc/*", status: 401 });
  });

  it("logs an unexpected RPC failure once and excludes the underlying error text", async () => {
    const { client, responses } = clientFor(
      app({
        readSession: async () => {
          throw new Error(secret.message, { cause: new Error(secret.cause) });
        },
      }),
    );
    await expect(client.account.get({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    const event = await expectCompletion(onlyResponse(responses), {
      operation: "rpc.request",
      route: "/rpc/*",
      status: 500,
    });
    expect(event?.error).toBeDefined();
  });

  it("logs an unmatched RPC as one 404 event without leaking its request body", async () => {
    const response = await app().request(`/rpc/unknown/method?token=${secret.query}`, {
      method: "POST",
      headers: { ...sensitiveHeaders, "content-type": "application/json" },
      body: JSON.stringify({ json: { password: secret.body } }),
    });
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND" },
      requestId: responseId(response),
    });
    await expectCompletion(response, { operation: "rpc.request", route: "/rpc/*", status: 404 });
  });

  it("logs a CORS preflight once without dispatching the RPC handler", async () => {
    let sessionReads = 0;
    const api = app({
      readSession: async () => {
        sessionReads += 1;
        return session;
      },
    });
    const response = await api.request(`/rpc/account/get?token=${secret.query}`, {
      method: "OPTIONS",
      headers: {
        ...sensitiveHeaders,
        origin: "https://web.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,authorization,x-request-id",
      },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://web.example.com");
    expect(sessionReads).toBe(0);
    await expectCompletion(response, { operation: "http.request", route: "/rpc/*", status: 204 });
  });

  it("returns an RPC response before a delayed sink while flush and close wait for delivery", async () => {
    let release: (() => void) | undefined;
    deliveryGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { client, responses } = clientFor(app());
    const request = client.account.get({});
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let flushing: Promise<void> | undefined;
    let closing: Promise<void> | undefined;
    let flushFinished = false;
    let closeFinished = false;
    try {
      const outcome = await Promise.race([
        request.then(() => "response"),
        new Promise<string>((resolve) => {
          timeout = setTimeout(() => resolve("timeout"), 1000);
        }),
      ]);
      expect(outcome).toBe("response");
      expect(onlyResponse(responses).status).toBe(200);
      expect(events).toHaveLength(0);

      flushing = runtime()
        .flush()
        .then(() => {
          flushFinished = true;
        });
      closing = runtime()
        .close()
        .then(() => {
          closeFinished = true;
        });
      await Promise.resolve();
      await Promise.resolve();
      expect(flushFinished).toBe(false);
      expect(closeFinished).toBe(false);
    } finally {
      clearTimeout(timeout);
      release?.();
      await Promise.all([request, flushing, closing]);
    }
    expect(flushFinished).toBe(true);
    expect(closeFinished).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      operation: "rpc.request",
      requestId: responseId(onlyResponse(responses)),
      status: 200,
    });
    expectPrivateDataAbsent();
  });

  it("keeps overlapping RPC events isolated with one server-owned ID per response", async () => {
    let release: (() => void) | undefined;
    const bothEntered = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sessionReads = 0;
    const api = app({
      readSession: async () => {
        sessionReads += 1;
        if (sessionReads === 2) release?.();
        await bothEntered;
        return session;
      },
    });
    const first = clientFor(api);
    const second = clientFor(api, { "x-request-id": `${secret.forgedId}-second` });
    await Promise.all([first.client.account.get({}), second.client.account.get({})]);
    await runtime().flush();

    const ids = [
      responseId(onlyResponse(first.responses)),
      responseId(onlyResponse(second.responses)),
    ];
    expect(new Set(ids).size).toBe(2);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.requestId)).toEqual(expect.arrayContaining(ids));
    for (const event of events) {
      expect(event).toMatchObject({ operation: "rpc.request", route: "/rpc/*", status: 200 });
    }
    expectPrivateDataAbsent();
  });
});
