import { afterEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { RoutineError, type RoutinesService } from "@raypx/jobs/routines";
import { createRoutineIngressRoutes } from "../../src/routines/http.js";
import { serveBackend } from "../fixtures/backend-server.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
function fixture() {
  const outcome = { status: "fired", runId: "run", conversationId: "conversation" } as const;
  const routines = {
    webhook: vi.fn<RoutinesService["webhook"]>().mockResolvedValue(outcome),
    email: vi.fn<RoutinesService["email"]>().mockResolvedValue(outcome),
    repository: vi.fn<RoutinesService["repository"]>().mockResolvedValue(outcome),
  };
  const token = "loopback-email-relay-credential-32-chars";
  const app = new Hono().route(
    "/routines",
    createRoutineIngressRoutes({ routines, emailRelayToken: token }),
  );
  const server = serveBackend({ app });
  cleanups.push(async () => {
    await server.stop(true);
  });
  function post(path: string, value: unknown, headers: Record<string, string>) {
    return fetch(new URL(path, server.url), {
      method: "POST",
      body: JSON.stringify(value),
      headers: { "content-type": "application/json", ...headers },
    });
  }
  return { routines, post, outcome, token };
}
it("admits keyed webhook JSON through the production loopback listener and returns duplicate outcomes", async () => {
  const f = fixture();
  const headers = { authorization: "Bearer webhook-key", "idempotency-key": "delivery" };
  const first = await f.post("/routines/routine/webhook", { event: "value" }, headers);
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual(f.outcome);
  f.routines.webhook.mockResolvedValueOnce({ ...f.outcome, status: "fired" });
  const repeated = await f.post("/routines/routine/webhook", { event: "value" }, headers);
  expect(await repeated.json()).toEqual({ ...f.outcome, status: "fired" });
  f.routines.webhook.mockRejectedValueOnce(new RoutineError("BODY_MISMATCH"));
  expect((await f.post("/routines/routine/webhook", { event: "different" }, headers)).status).toBe(
    409,
  );
});
it("admits normalized inbound email only with its independent relay credential over loopback", async () => {
  const f = fixture();
  const message = {
    address: "routine@mail.example.test",
    sender: "sender@example.test",
    messageId: "message-id",
    text: "untrusted inbound text",
  };
  expect((await f.post("/routines/email", message, { authorization: "Bearer wrong" })).status).toBe(
    401,
  );
  const response = await f.post("/routines/email", message, { authorization: `Bearer ${f.token}` });
  expect(response.status).toBe(200);
  expect(f.routines.email).toHaveBeenCalledExactlyOnceWith(message);
});
it("passes repository signature and delivery identity unchanged through loopback", async () => {
  const f = fixture();
  const signature = `sha256=${"b".repeat(64)}`;
  const response = await f.post(
    "/routines/routine/repository",
    { reference: "branch" },
    { "x-routine-signature": signature, "x-delivery-id": "delivery-id", "x-event-kind": "push" },
  );
  expect(response.status).toBe(200);
  expect(f.routines.repository).toHaveBeenCalledExactlyOnceWith(
    "routine",
    signature,
    "delivery-id",
    "push",
    '{"reference":"branch"}',
  );
  f.routines.repository.mockRejectedValueOnce(new RoutineError("UNAUTHORIZED"));
  expect(
    (
      await f.post(
        "/routines/routine/repository",
        {},
        {
          "x-routine-signature": "invalid",
          "x-delivery-id": "delivery-id",
          "x-event-kind": "push",
        },
      )
    ).status,
  ).toBe(401);
});
