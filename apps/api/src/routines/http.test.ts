import { afterEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { RoutineError, type RoutinesService } from "@raypx/jobs/routines";
import { createRoutineIngressRoutes, MAX_ROUTINE_INGRESS_BYTES } from "./http.js";
import { registerApiMiddleware } from "../middleware/http.js";
import type { ApiRouterEnv } from "../routers/request.js";
import { createApiLogging, type ApiLogging } from "../logging.js";
import type { SafeEvent } from "@raypx/logger/safe";
import { testAppOptions } from "../../tests/helpers/app.js";

const token = "dedicated-email-relay-test-secret-32-chars";
const outcome = { status: "fired", runId: "run", conversationId: "conversation" } as const;
function fixture() {
  const routines = {
    webhook: vi.fn<RoutinesService["webhook"]>().mockResolvedValue(outcome),
    email: vi.fn<RoutinesService["email"]>().mockResolvedValue(outcome),
    repository: vi.fn<RoutinesService["repository"]>().mockResolvedValue(outcome),
  };
  const app = createRoutineIngressRoutes({ routines, emailRelayToken: token });
  return { app, routines };
}
function post(
  app: ReturnType<typeof createRoutineIngressRoutes>,
  path: string,
  body: string,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

it("requires webhook bearer and retry key and forwards original JSON bytes", async () => {
  const f = fixture();
  const body = '{ "private": "payload" }';
  const headers = { authorization: "Bearer webhook-key", "idempotency-key": "delivery" };
  expect((await post(f.app, "/routine/webhook", body)).status).toBe(401);
  expect(
    (await post(f.app, "/routine/webhook", body, { authorization: headers.authorization })).status,
  ).toBe(400);
  expect((await post(f.app, "/routine/webhook", body, headers)).status).toBe(200);
  expect(f.routines.webhook).toHaveBeenCalledExactlyOnceWith(
    "routine",
    "webhook-key",
    "delivery",
    body,
  );
  f.routines.webhook.mockRejectedValueOnce(new RoutineError("BODY_MISMATCH"));
  expect((await post(f.app, "/routine/webhook", body, headers)).status).toBe(409);
  f.routines.webhook.mockRejectedValueOnce(new RoutineError("RATE_LIMITED"));
  const limited = await post(f.app, "/routine/webhook", body, headers);
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
});

it("bounds declared and streamed body bytes and rejects malformed JSON and UTF-8", async () => {
  const f = fixture();
  const headers = { authorization: "Bearer key", "idempotency-key": "delivery" };
  expect(
    (
      await post(
        f.app,
        "/routine/webhook",
        JSON.stringify("x".repeat(MAX_ROUTINE_INGRESS_BYTES)),
        headers,
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await post(f.app, "/routine/webhook", "{}", {
        ...headers,
        "content-length": String(MAX_ROUTINE_INGRESS_BYTES + 1),
      })
    ).status,
  ).toBe(413);
  expect((await post(f.app, "/routine/webhook", "{", headers)).status).toBe(400);
  expect(
    (
      await f.app.request("/routine/webhook", {
        method: "POST",
        body: new Uint8Array([255]),
        headers: { "content-type": "application/json", ...headers },
      })
    ).status,
  ).toBe(400);
  expect(f.routines.webhook).not.toHaveBeenCalled();
});

it("authenticates the email relay before reading and strictly validates normalized mail", async () => {
  const f = fixture();
  const message = {
    address: "generated@mail.example.test",
    sender: "allowed@example.test",
    messageId: "message",
    text: "untrusted mail",
    subject: "subject",
  };
  const body = JSON.stringify(message);
  expect((await post(f.app, "/email", body)).status).toBe(401);
  expect((await post(f.app, "/email", body, { authorization: "Bearer wrong" })).status).toBe(401);
  expect((await post(f.app, "/email", body, { authorization: `Bearer ${token}` })).status).toBe(
    200,
  );
  expect(f.routines.email).toHaveBeenCalledExactlyOnceWith(message);
  expect(
    (
      await post(f.app, "/email", JSON.stringify({ ...message, text: "x".repeat(32_001) }), {
        authorization: `Bearer ${token}`,
      })
    ).status,
  ).toBe(400);
  f.routines.email.mockRejectedValueOnce(new RoutineError("UNAUTHORIZED"));
  expect((await post(f.app, "/email", body, { authorization: `Bearer ${token}` })).status).toBe(
    401,
  );
});

it("requires signed repository delivery metadata and preserves signed bytes", async () => {
  const f = fixture();
  const headers = {
    "x-routine-signature": `sha256=${"a".repeat(64)}`,
    "x-delivery-id": "delivery",
    "x-event-kind": "push",
  };
  const body = '{"change":"untrusted"}';
  expect((await post(f.app, "/routine/repository", body)).status).toBe(400);
  expect((await post(f.app, "/routine/repository", body, headers)).status).toBe(200);
  expect(f.routines.repository).toHaveBeenCalledExactlyOnceWith(
    "routine",
    headers["x-routine-signature"],
    "delivery",
    "push",
    body,
  );
  f.routines.repository.mockRejectedValueOnce(new RoutineError("UNAUTHORIZED"));
  expect((await post(f.app, "/routine/repository", body, headers)).status).toBe(401);
});

let logger: ApiLogging | undefined;
afterEach(async () => {
  await logger?.close();
  logger = undefined;
});
it("keeps every ingress credential and payload out of response errors and diagnostic logs", async () => {
  const f = fixture();
  const events: SafeEvent[] = [];
  logger = createApiLogging({
    environment: "test",
    sink: ({ event }) => {
      events.push(event);
    },
  });
  const app = new Hono<ApiRouterEnv>();
  registerApiMiddleware(app, testAppOptions({ logger }));
  app.route("/routines", f.app);
  const key = "private-webhook-credential-for-logging";
  const payload = "private-payload-for-logging";
  f.routines.webhook.mockRejectedValueOnce(new Error(`${key} ${payload}`));
  const response = await app.request("/routines/routine/webhook?secret=private-query", {
    method: "POST",
    body: JSON.stringify({ payload }),
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "idempotency-key": "private-delivery-key",
    },
  });
  expect(response.status).toBe(503);
  const text = await response.text();
  const emailText = "private-email-text-for-logging";
  const signature = `sha256=${"a".repeat(64)}`;
  await app.request("/routines/email", {
    method: "POST",
    body: JSON.stringify({
      address: "routine@mail.example.test",
      sender: "private-sender@example.test",
      messageId: "private-email-message-id",
      text: emailText,
    }),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  });
  await app.request("/routines/routine/repository", {
    method: "POST",
    body: JSON.stringify({ payload }),
    headers: {
      "content-type": "application/json",
      "x-routine-signature": signature,
      "x-delivery-id": "private-repository-delivery-id",
      "x-event-kind": "push",
    },
  });
  await logger.flush();
  const logged = JSON.stringify(events);
  expect(events).toHaveLength(3);
  for (const secret of [
    key,
    payload,
    "private-query",
    "private-delivery-key",
    token,
    emailText,
    signature,
    "private-sender@example.test",
    "private-email-message-id",
    "private-repository-delivery-id",
  ]) {
    expect(text).not.toContain(secret);
    expect(logged).not.toContain(secret);
  }
});
