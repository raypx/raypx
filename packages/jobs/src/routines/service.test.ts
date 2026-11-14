import { expect, it, vi } from "vitest";
import { routineInputSchema, type Routine } from "@raypx/core/routines";
import { spaceMemberSchema } from "@raypx/core/spaces";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { createRoutinesService, routineDigest } from "./service.js";
import type { RoutineAdmission, RoutineSecret, RoutinesRepository } from "./types.js";
const instant = new Date("2026-11-14T00:00:00Z");
const scope = resolveSpaceScope(
  spaceMemberSchema.parse({
    spaceId: "space",
    accountId: "owner",
    role: "owner",
    createdAt: instant.toISOString(),
  }),
  "owner",
  "space" as never,
);
const input = routineInputSchema.parse({
  agentId: "agent",
  name: "Routine",
  prompt: "Saved prompt",
  enabled: true,
  triggers: {
    webhook: true,
    email: { allowedSender: "sender@example.test" },
    repository: { events: ["push"] },
  },
});
async function fixture() {
  let routine: Routine = {
    ...input,
    id: crypto.randomUUID(),
    spaceId: scope.spaceId,
    ownerAccountId: "owner",
    emailAddress: "routine@example.test",
    nextDueAt: null,
    createdAt: instant.toISOString(),
    updatedAt: instant.toISOString(),
  };
  let webhookDigest = await routineDigest("initial-key");
  let secret: RoutineSecret = {
    id: "secret",
    accountId: "owner",
    keyId: "key",
    ciphertext: "sealed",
    wrappedDataKey: "wrapped",
  };
  const admission = (): RoutineAdmission => ({ scope, routine, webhookDigest, secret });
  const fire = vi.fn(async () => ({
    status: "fired" as const,
    runId: "run",
    conversationId: "conversation",
  }));
  const repository = {
    get: vi.fn(async () => routine),
    ingress: vi.fn(async () => admission()),
    admission: vi.fn(async () => admission()),
    update: vi.fn(async (_scope, _id, value, _now, values) => {
      routine = { ...routine, ...value, ownerAccountId: _scope.member.accountId };
      webhookDigest = values.webhookDigest;
      secret = values.secret!;
      return routine;
    }),
    rotateWebhook: vi.fn(async (_scope, _id, digest) => {
      webhookDigest = digest;
      return routine;
    }),
    fire,
  } satisfies Partial<RoutinesRepository>;
  const seal = vi.fn(async () => ({
    keyId: "key",
    ciphertext: "sealed",
    wrappedDataKey: "wrapped",
  }));
  const open = vi.fn(async () => "repository-secret");
  const dispatch = vi.fn();
  const service = createRoutinesService(repository as unknown as RoutinesRepository, {
    now: () => instant,
    emailDomain: "example.test",
    secrets: { seal, open },
    dispatch,
  });
  return { service, fire, repository, seal, open, dispatch, routine };
}

it("verifies digest-only webhook keys and immediate rotation; bounds payloads", async () => {
  const f = await fixture();
  await f.service.webhook(f.routine.id, "initial-key", "one", '{"text":"external"}');
  expect(f.fire).toHaveBeenCalledWith(
    scope,
    f.routine.id,
    expect.objectContaining({
      kind: "webhook",
      untrustedText: '{"text":"external"}',
      dueAt: instant,
    }),
  );
  const rotated = await f.service.rotateWebhookKey(scope, f.routine.id);
  await expect(f.service.webhook(f.routine.id, "initial-key", "two", "{}")).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await f.service.webhook(f.routine.id, rotated.webhookKey, "two", "{}");
  await expect(
    f.service.webhook(
      f.routine.id,
      rotated.webhookKey,
      "three",
      JSON.stringify("x".repeat(65_536)),
    ),
  ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  expect(f.fire).toHaveBeenCalledTimes(2);
});

it("enforces sender identity before invoking durable email deduplication", async () => {
  const f = await fixture();
  await expect(
    f.service.email({
      address: "routine@example.test",
      sender: "stranger@example.test",
      messageId: "id",
      text: "text",
    }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(f.fire).not.toHaveBeenCalled();
  await f.service.email({
    address: "routine@example.test",
    sender: "Sender@Example.test",
    messageId: "id",
    text: "text",
    subject: "subject",
  });
  expect(f.fire).toHaveBeenCalledWith(
    scope,
    f.routine.id,
    expect.objectContaining({ kind: "email", emailSender: "sender@example.test", id: "id" }),
  );
});

it("authenticates repository delivery id, kind and exact body before event filtering", async () => {
  const f = await fixture();
  const body = '{"text":"external"}';
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("repository-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature =
    "sha256=" +
    Buffer.from(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`delivery\npush\n${body}`)),
    ).toString("hex");
  await f.service.repository(f.routine.id, signature, "delivery", "push", body);
  expect(f.fire).toHaveBeenCalledTimes(1);
  await expect(
    f.service.repository(f.routine.id, signature, "changed-id", "push", body),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    f.service.repository(f.routine.id, signature, "delivery", "issues", body),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    f.service.repository(f.routine.id, signature, "delivery", "push", "{}"),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("transfers ownership on editing and reseals the same repository secret for the editor", async () => {
  const f = await fixture();
  const editor = resolveSpaceScope(
    spaceMemberSchema.parse({ ...scope.member, accountId: "editor" }),
    "editor",
    scope.spaceId,
  );
  const result = await f.service.update(editor, f.routine.id, { ...input, name: "Edited" });
  expect(result.routine.ownerAccountId).toBe("editor");
  expect(f.open).toHaveBeenCalledWith(
    "owner",
    "secret",
    expect.objectContaining({ ciphertext: "sealed" }),
  );
  expect(f.seal).toHaveBeenCalledWith("editor", expect.any(String), "repository-secret");
  expect(result.repositorySecret).toBeNull();
});

it("requires email deployment configuration and has a pure constructor", async () => {
  const repository = new Proxy(
    {},
    {
      get() {
        throw new Error("Construction touched repository");
      },
    },
  ) as RoutinesRepository;
  const service = createRoutinesService(repository, {
    dispatch() {},
    secrets: { seal: vi.fn(), open: vi.fn() },
  });
  await expect(service.create(scope, input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

it("distinguishes missing triggers from unavailable email deployment configuration on reads", async () => {
  const f = await fixture();
  const withoutEmail = createRoutinesService(f.repository as unknown as RoutinesRepository, {
    dispatch() {},
    secrets: { seal: f.seal, open: f.open },
    publicApiOrigin: "https://api.example.test/",
  });
  expect((await withoutEmail.get(scope, f.routine.id)).ingress?.email).toEqual({
    address: null,
    unavailableReason: "EMAIL_NOT_CONFIGURED",
  });
  f.repository.get.mockResolvedValueOnce({ ...f.routine, triggers: { webhook: true } });
  const result = await withoutEmail.get(scope, f.routine.id);
  expect(result.ingress).toEqual({
    webhook: {
      url: `https://api.example.test/routines/${f.routine.id}/webhook`,
      unavailableReason: null,
    },
    repository: { url: null, unavailableReason: "TRIGGER_NOT_CONFIGURED" },
    email: { address: null, unavailableReason: "TRIGGER_NOT_CONFIGURED" },
  });
  expect(f.open).not.toHaveBeenCalled();
});
