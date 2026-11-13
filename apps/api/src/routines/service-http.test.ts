import { expect, it, vi } from "vitest";
import {
  createRoutinesService,
  RoutineError,
  type RoutinesRepository,
  type RoutineAdmission,
  type RoutineFire,
} from "@raypx/jobs/routines";
import { routineSchema, type RoutineDeliveryOutcome } from "@raypx/core/routines";
import { spaceIdSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { resolveSpaceScope } from "@raypx/spaces/server";
import {
  applicationSecretKeyProvider,
  openStoredSecret,
  sealStoredSecret,
} from "../conversations/secrets.js";
import { createRoutineIngressRoutes } from "./http.js";

const routineId = "828f4551-39f6-4ce8-9db5-777126068afa";
const relayToken = "independent-test-mail-relay-secret-32-characters";
async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function signature(secret: string, deliveryId: string, eventKind: string, raw: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${deliveryId}\n${eventKind}\n${raw}`),
  );
  return `sha256=${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
/** Real ingress/service/secret envelope, with deterministic repository and dispatch ports. */
async function fixture() {
  const at = new Date("2026-11-01T00:00:00Z");
  const spaceId = spaceIdSchema.parse("space");
  const scope = resolveSpaceScope(
    spaceMemberSchema.parse({
      spaceId,
      accountId: "owner",
      role: "owner",
      createdAt: at.toISOString(),
    }),
    "owner",
    spaceId,
  );
  const webhookKey = "private-webhook-test-key";
  const repositorySecret = "private-repository-test-secret";
  const keys = applicationSecretKeyProvider("independent-application-key-32-characters");
  const secret = {
    id: "secret",
    accountId: "owner",
    ...(await sealStoredSecret(keys, "owner", "secret", repositorySecret)),
  };
  const admission: RoutineAdmission = {
    scope,
    routine: routineSchema.parse({
      id: routineId,
      spaceId,
      ownerAccountId: "owner",
      agentId: "agent",
      name: "Routine",
      prompt: "Saved prompt",
      enabled: true,
      triggers: {
        webhook: true,
        email: { allowedSender: "allowed@example.test" },
        repository: { events: ["push"] },
      },
      emailAddress: `${routineId}@mail.example.test`,
      nextDueAt: null,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    }),
    webhookDigest: await digest(webhookKey),
    secret,
  };
  const deliveries = new Map<
    string,
    { digest: string; outcome: RoutineDeliveryOutcome; input: RoutineFire }
  >();
  let runCount = 0;
  const fire = vi.fn<RoutinesRepository["fire"]>(async (_scope, _id, input) => {
    const key = `${input.kind}:${input.id}`;
    const prior = deliveries.get(key);
    if (prior) {
      if (prior.digest !== input.bodyDigest) throw new RoutineError("BODY_MISMATCH");
      return { ...prior.outcome };
    }
    let outcome: RoutineDeliveryOutcome;
    if (
      input.kind === "repository" &&
      !admission.routine.triggers.repository!.events.includes(input.repositoryEvent!)
    ) {
      outcome = { status: "ignored", runId: null, conversationId: null };
    } else {
      runCount++;
      outcome = { status: "fired", runId: `run-${runCount}`, conversationId: "conversation" };
    }
    deliveries.set(key, { digest: input.bodyDigest, outcome, input });
    return outcome;
  });
  const ingress = vi.fn<RoutinesRepository["ingress"]>(async (selection) => {
    if (
      ("id" in selection && selection.id !== routineId) ||
      ("address" in selection && selection.address !== admission.routine.emailAddress)
    )
      throw new RoutineError("NOT_FOUND");
    return admission;
  });
  const repository = new Proxy(
    { ingress, fire },
    {
      get(target, key) {
        if (key === "ingress") return target.ingress;
        if (key === "fire") return target.fire;
        return () => {
          throw new Error(`Unexpected repository call ${String(key)}`);
        };
      },
    },
  ) as unknown as RoutinesRepository;
  const dispatch = vi.fn();
  const routines = createRoutinesService(repository, {
    now: () => new Date(at),
    dispatch,
    secrets: {
      seal: (accountId, secretId, value) => sealStoredSecret(keys, accountId, secretId, value),
      open: (accountId, secretId, sealed) => openStoredSecret(keys, accountId, secretId, sealed),
    },
    emailDomain: "mail.example.test",
  });
  const app = createRoutineIngressRoutes({ routines, emailRelayToken: relayToken });
  function post(path: string, raw: string, headers: Record<string, string>) {
    return app.request(path, {
      method: "POST",
      body: raw,
      headers: { "content-type": "application/json", ...headers },
    });
  }
  return {
    post,
    fire,
    deliveries,
    admission,
    webhookKey,
    repositorySecret,
    dispatch,
    runCount: () => runCount,
  };
}
it("authenticates real webhook keys, pins untrusted bytes, and deduplicates delivery identity", async () => {
  const f = await fixture();
  const raw = '{"outside":"untrusted instructions"}';
  const path = `/${routineId}/webhook`;
  expect(
    (await f.post(path, raw, { authorization: "Bearer wrong", "idempotency-key": "delivery" }))
      .status,
  ).toBe(401);
  const headers = { authorization: `Bearer ${f.webhookKey}`, "idempotency-key": "delivery" };
  const first = await f.post(path, raw, headers);
  expect(await first.json()).toEqual({
    status: "fired",
    runId: "run-1",
    conversationId: "conversation",
  });
  const duplicate = await f.post(path, raw, headers);
  expect(await duplicate.json()).toMatchObject({ status: "fired", runId: "run-1" });
  expect((await f.post(path, '{"outside":"different"}', headers)).status).toBe(409);
  expect(f.runCount()).toBe(1);
  expect(f.deliveries.get("webhook:delivery")!.input).toMatchObject({
    untrustedText: raw,
    dueAt: new Date("2026-11-01T00:00:00Z"),
  });
  f.admission.webhookDigest = await digest("rotated-key");
  expect((await f.post(path, raw, headers)).status).toBe(401);
});
it("enforces real email sender policy and deduplicates authenticated normalized messages", async () => {
  const f = await fixture();
  const headers = { authorization: `Bearer ${relayToken}` };
  const message = {
    address: f.admission.routine.emailAddress,
    sender: "blocked@example.test",
    messageId: "message",
    text: "Untrusted mail text",
  };
  expect((await f.post("/email", JSON.stringify(message), headers)).status).toBe(401);
  message.sender = "ALLOWED@example.test";
  expect((await f.post("/email", JSON.stringify(message), headers)).status).toBe(200);
  expect(await (await f.post("/email", JSON.stringify(message), headers)).json()).toMatchObject({
    status: "fired",
    runId: "run-1",
  });
  expect(f.runCount()).toBe(1);
  expect(f.deliveries.get("email:message")!.input.untrustedText).toContain(message.text);
});
it("verifies real repository signatures, binds event and delivery metadata, filters kinds and deduplicates", async () => {
  const f = await fixture();
  const raw = '{"reference":"branch"}';
  const signed = await signature(f.repositorySecret, "delivery", "push", raw);
  const headers = {
    "x-routine-signature": signed,
    "x-delivery-id": "delivery",
    "x-event-kind": "push",
  };
  const path = `/${routineId}/repository`;
  expect((await f.post(path, raw, { ...headers, "x-delivery-id": "replayed" })).status).toBe(401);
  expect((await f.post(path, raw, { ...headers, "x-event-kind": "pull_request" })).status).toBe(
    401,
  );
  expect((await f.post(path, raw, headers)).status).toBe(200);
  expect(await (await f.post(path, raw, headers)).json()).toMatchObject({
    status: "fired",
    runId: "run-1",
  });
  const ignoredHeaders = {
    "x-routine-signature": await signature(f.repositorySecret, "ignored", "pull_request", raw),
    "x-delivery-id": "ignored",
    "x-event-kind": "pull_request",
  };
  expect(await (await f.post(path, raw, ignoredHeaders)).json()).toEqual({
    status: "ignored",
    runId: null,
    conversationId: null,
  });
  expect(f.runCount()).toBe(1);
  expect(f.deliveries.get("repository:delivery")!.input.untrustedText).toBe(raw);
});
