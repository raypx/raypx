import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  agents,
  conversations,
  conversationRuns,
  routineDeliveries,
  routineIdentities,
  routineEvents,
  routineOccurrences,
  routineSecrets,
  routines,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import { and, eq, inArray } from "drizzle-orm";
import { spaceMemberSchema } from "@raypx/core/spaces";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { routineInputSchema } from "@raypx/core/routines";
import { createRoutinesService } from "../../src/routines/service.js";
import { createRoutinesRepository } from "../../src/routines/postgres.js";
import type { RoutineSecretStore } from "../../src/routines/types.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const first = connectDatabase(url, { max: 2 });
const second = connectDatabase(url, { max: 2 });
const accounts: string[] = [];
const spaceIds: string[] = [];
let now = new Date("2026-11-14T00:00:00Z");
const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
const secrets: RoutineSecretStore = {
  async seal(accountId, secretId, value) {
    const key = await crypto.subtle.importKey("raw", encryptionKey, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${accountId}:${secretId}`) },
      key,
      new TextEncoder().encode(value),
    );
    return {
      keyId: "fixture",
      wrappedDataKey: Buffer.from(iv).toString("base64"),
      ciphertext: Buffer.from(ciphertext).toString("base64"),
    };
  },
  async open(accountId, secretId, value) {
    const key = await crypto.subtle.importKey("raw", encryptionKey, "AES-GCM", false, ["decrypt"]);
    const result = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(value.wrappedDataKey, "base64"),
        additionalData: new TextEncoder().encode(`${accountId}:${secretId}`),
      },
      key,
      Buffer.from(value.ciphertext, "base64"),
    );
    return new TextDecoder().decode(result);
  },
};
const logs: unknown[] = [];
const make = (db: typeof first.db) =>
  createRoutinesService(
    createRoutinesRepository(db, { rateLimit: 2, onEvent: (event) => logs.push(event) }),
    { now: () => now, emailDomain: "routines.example.test", secrets, dispatch() {} },
  );
const service = make(first.db);
const other = make(second.db);
beforeAll(() => migrateDatabase(url));
afterAll(async () => {
  try {
    if (spaceIds.length) await first.db.delete(spaces).where(inArray(spaces.id, spaceIds));
    if (accounts.length) await first.db.delete(user).where(inArray(user.id, accounts));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
async function fixture() {
  now = new Date("2026-11-14T00:00:00Z");
  const accountId = `routine-${crypto.randomUUID()}`,
    spaceId = `space-${crypto.randomUUID()}`,
    agentId = `agent-${crypto.randomUUID()}`,
    conversationId = crypto.randomUUID();
  accounts.push(accountId);
  spaceIds.push(spaceId);
  await first.db
    .insert(user)
    .values({ id: accountId, name: "Routine member", email: `${accountId}@example.test` });
  await first.db.insert(spaces).values({ id: spaceId, name: "Routine Space" });
  const member = spaceMemberSchema.parse({
    spaceId,
    accountId,
    role: "owner",
    createdAt: now.toISOString(),
  });
  await first.db.insert(spaceMembers).values({ ...member, createdAt: now });
  await first.db.insert(agents).values({
    spaceId,
    id: agentId,
    name: "Fixture",
    instructions: "Fixture instructions",
    modelId: "fixture",
  });
  await first.db
    .insert(conversations)
    .values({ spaceId, id: conversationId, agentId, kind: "direct" });
  const scope = resolveSpaceScope(member, accountId, member.spaceId);
  const input = routineInputSchema.parse({
    agentId,
    name: "Fixture",
    prompt: "saved-private-prompt",
    enabled: true,
    triggers: {
      schedule: { cron: "* * * * *", timezone: "Asia/Shanghai" },
      webhook: true,
      email: { allowedSender: "allowed@example.test" },
      repository: { events: ["push"] },
    },
  });
  return { scope, input, accountId, spaceId, agentId, conversationId };
}

it("fires a durable occurrence once across two workers and coalesces a later pending catch-up", async () => {
  const f = await fixture();
  const created = await service.create(f.scope, f.input);
  now = new Date("2026-11-14T00:20:00Z");
  await Promise.all([service.scan(), other.scan()]);
  let history = await service.history(f.scope, created.routine.id);
  expect(history).toHaveLength(1);
  expect(history[0]?.dueAt).toBe("2026-11-14T00:01:00.000Z");
  now = new Date("2026-11-14T00:21:00Z");
  await Promise.all([service.scan(), other.scan()]);
  history = await service.history(f.scope, created.routine.id);
  expect(history).toHaveLength(2);
  expect(new Set(history.map((row) => row.runId)).size).toBe(1);
  expect(history.some((row) => row.status === "coalesced")).toBe(true);
  const runs = await first.db
    .select()
    .from(conversationRuns)
    .where(eq(conversationRuns.spaceId, f.spaceId));
  expect(runs).toHaveLength(1);
  expect(runs[0]?.memberAccountId).toBe(f.accountId);
  await first.db
    .update(conversationRuns)
    .set({ startedAt: now })
    .where(eq(conversationRuns.spaceId, f.spaceId));
  expect(
    (await service.history(f.scope, created.routine.id)).find((row) => row.status === "fired")
      ?.delayMs,
  ).toBe(20 * 60_000);
  const recorded = await service.events(f.scope, created.routine.id);
  expect(recorded.map((row) => row.kind).sort()).toEqual(["routine.coalesced", "routine.fired"]);
  expect(JSON.stringify(recorded)).not.toContain("saved-private-prompt");
});

it.each([undefined, "https://ingress.example.test/"])(
  "reads complete ingress addresses without keys from isolated persisted routines (%s)",
  async (publicApiOrigin) => {
    const f = await fixture();
    const created = await service.create(f.scope, f.input);
    const reader = createRoutinesService(createRoutinesRepository(first.db), {
      now: () => now,
      dispatch() {},
      secrets,
      emailDomain: "routines.example.test",
      ...(publicApiOrigin ? { publicApiOrigin } : {}),
    });
    try {
      const result = await reader.get(f.scope, created.routine.id);
      const listed = await reader.list(f.scope, f.agentId, 10);
      const expected = {
        webhook: {
          url: publicApiOrigin ? `${publicApiOrigin}routines/${result.id}/webhook` : null,
          unavailableReason: publicApiOrigin ? null : "PUBLIC_API_ORIGIN_NOT_CONFIGURED",
        },
        repository: {
          url: publicApiOrigin ? `${publicApiOrigin}routines/${result.id}/repository` : null,
          unavailableReason: publicApiOrigin ? null : "PUBLIC_API_ORIGIN_NOT_CONFIGURED",
        },
        email: { address: created.routine.emailAddress, unavailableReason: null },
      };
      expect(result.ingress).toEqual(expected);
      expect(listed).toEqual([result]);
      expect(JSON.stringify(result)).not.toContain(created.webhookKey);
      expect(JSON.stringify(result)).not.toContain(created.repositorySecret);
      expect(result).not.toHaveProperty("webhookDigest");
      expect(result).not.toHaveProperty("secret");
    } finally {
      await first.db.delete(spaces).where(eq(spaces.id, f.spaceId));
    }
  },
);

it("pauses automatic work, allows an idempotent manual test and transfers edited ownership", async () => {
  const f = await fixture();
  const created = await service.create(f.scope, f.input);
  await service.pause(f.scope, created.routine.id);
  now = new Date("2026-11-14T01:00:00Z");
  await service.scan();
  expect(await service.history(f.scope, created.routine.id)).toEqual([]);
  const a = await service.test(f.scope, created.routine.id, "manual");
  expect(await service.test(f.scope, created.routine.id, "manual")).toEqual(a);
  const editor = `editor-${crypto.randomUUID()}`;
  accounts.push(editor);
  await first.db
    .insert(user)
    .values({ id: editor, name: "Editor", email: `${editor}@example.test` });
  const member = spaceMemberSchema.parse({ ...f.scope.member, accountId: editor });
  await first.db.insert(spaceMembers).values({ ...member, createdAt: now });
  const editorScope = resolveSpaceScope(member, editor, member.spaceId);
  const edited = await service.update(editorScope, created.routine.id, f.input);
  expect(edited.routine.ownerAccountId).toBe(editor);
  const b = await service.test(f.scope, created.routine.id, "after-transfer");
  const [run] = await first.db
    .select()
    .from(conversationRuns)
    .where(and(eq(conversationRuns.spaceId, f.spaceId), eq(conversationRuns.id, b.runId!)));
  expect(run?.memberAccountId).toBe(editor);
  const [secret] = await first.db
    .select()
    .from(routineSecrets)
    .where(eq(routineSecrets.spaceId, f.spaceId));
  expect(secret?.accountId).toBe(editor);
  expect(await secrets.open(editor, secret!.id, secret!)).toBe(created.repositorySecret);
});

it("deduplicates webhooks durably, rejects body mismatch and revoked keys and enforces durable rate limits", async () => {
  const f = await fixture();
  const { routine, webhookKey } = await service.create(f.scope, f.input);
  const body = '{"private":"payload-marker"}';
  const original = await service.webhook(routine.id, webhookKey!, "one", body);
  expect(await other.webhook(routine.id, webhookKey!, "one", body)).toEqual(original);
  await expect(service.webhook(routine.id, webhookKey!, "one", "{}")).rejects.toMatchObject({
    code: "BODY_MISMATCH",
  });
  const rotated = await service.rotateWebhookKey(f.scope, routine.id);
  await expect(service.webhook(routine.id, webhookKey!, "two", body)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await service.webhook(routine.id, rotated.webhookKey, "two", body);
  await expect(other.webhook(routine.id, rotated.webhookKey, "three", body)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  await expect(
    service.webhook(routine.id, rotated.webhookKey, "large", JSON.stringify("x".repeat(65536))),
  ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  const rows = await first.db
    .select()
    .from(routineDeliveries)
    .where(eq(routineDeliveries.spaceId, f.spaceId));
  expect(rows).toHaveLength(2);
  const logged = JSON.stringify(logs);
  expect(logged).not.toContain(webhookKey);
  expect(logged).not.toContain(rotated.webhookKey);
  expect(logged).not.toContain("payload-marker");
  expect(logged).not.toContain("saved-private-prompt");
});

it("enforces email sender/dedup and signed repository event filtering/delivery dedup", async () => {
  const f = await fixture();
  const { routine, repositorySecret } = await service.create(f.scope, f.input);
  const email = {
    address: routine.emailAddress!,
    sender: "allowed@example.test",
    messageId: "message-1",
    text: "external text",
  };
  await expect(service.email({ ...email, sender: "other@example.test" })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  const original = await service.email(email);
  expect(await other.email(email)).toEqual(original);
  const body = '{"action":"opened"}';
  const signingKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(repositorySecret!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sign = async (id: string, kind: string) =>
    "sha256=" +
    Buffer.from(
      await crypto.subtle.sign(
        "HMAC",
        signingKey,
        new TextEncoder().encode(`${id}\n${kind}\n${body}`),
      ),
    ).toString("hex");
  await expect(
    service.repository(routine.id, "sha256=" + "0".repeat(64), "delivery-1", "push", body),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  const signature = await sign("delivery-1", "push");
  const result = await service.repository(routine.id, signature, "delivery-1", "push", body);
  expect(await other.repository(routine.id, signature, "delivery-1", "push", body)).toEqual(result);
  await expect(
    service.repository(
      routine.id,
      await sign("delivery-1", "issues"),
      "delivery-1",
      "issues",
      body,
    ),
  ).rejects.toMatchObject({ code: "BODY_MISMATCH" });
  now = new Date(now.getTime() + 60_000);
  expect(
    await service.repository(
      routine.id,
      await sign("filtered", "issues"),
      "filtered",
      "issues",
      body,
    ),
  ).toEqual({ status: "ignored", runId: null, conversationId: null });
  const runs = await first.db
    .select()
    .from(conversationRuns)
    .where(eq(conversationRuns.spaceId, f.spaceId));
  expect(runs).toHaveLength(2);
  expect(runs.every((row) => row.inboundProvenance !== null && row.inboundContent !== null)).toBe(
    true,
  );
});

it.each(["space", "membership", "account"])(
  "cascades routines, occurrences, deliveries, event metadata and encrypted secrets on %s deletion",
  async (kind) => {
    const f = await fixture();
    const created = await service.create(f.scope, f.input);
    await service.webhook(created.routine.id, created.webhookKey!, "delivery", "{}");
    if (kind === "space") await first.db.delete(spaces).where(eq(spaces.id, f.spaceId));
    if (kind === "membership")
      await first.db
        .delete(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, f.spaceId), eq(spaceMembers.accountId, f.accountId)));
    if (kind === "account") await first.db.delete(user).where(eq(user.id, f.accountId));
    for (const table of [
      routines,
      routineSecrets,
      routineOccurrences,
      routineDeliveries,
      routineEvents,
    ]) {
      expect(await first.db.select().from(table).where(eq(table.spaceId, f.spaceId))).toEqual([]);
    }
    const identities = await first.db
      .select()
      .from(routineIdentities)
      .where(eq(routineIdentities.spaceId, f.spaceId));
    expect(identities).toHaveLength(kind === "space" ? 0 : 1);
  },
);

async function crossSpacePair() {
  const local = await fixture();
  const foreign = await fixture();
  const localCreated = await service.create(local.scope, local.input);
  const foreignCreated = await service.create(foreign.scope, foreign.input);
  await service.webhook(
    localCreated.routine.id,
    localCreated.webhookKey!,
    crypto.randomUUID(),
    "{}",
  );
  const foreignOutcome = await service.webhook(
    foreignCreated.routine.id,
    foreignCreated.webhookKey!,
    crypto.randomUUID(),
    "{}",
  );
  const [localSecret] = await first.db
    .select()
    .from(routineSecrets)
    .where(eq(routineSecrets.spaceId, local.spaceId));
  const [localOccurrence] = await first.db
    .select()
    .from(routineOccurrences)
    .where(eq(routineOccurrences.spaceId, local.spaceId));
  const [foreignOccurrence] = await first.db
    .select()
    .from(routineOccurrences)
    .where(eq(routineOccurrences.spaceId, foreign.spaceId));
  const [localDelivery] = await first.db
    .select()
    .from(routineDeliveries)
    .where(eq(routineDeliveries.spaceId, local.spaceId));
  const [localEvent] = await first.db
    .select()
    .from(routineEvents)
    .where(eq(routineEvents.spaceId, local.spaceId));
  return {
    local,
    foreign,
    localCreated,
    foreignCreated,
    foreignOutcome,
    localSecret: localSecret!,
    localOccurrence: localOccurrence!,
    foreignOccurrence: foreignOccurrence!,
    localDelivery: localDelivery!,
    localEvent: localEvent!,
  };
}

it("rejects routine Agent and owner references from another Space with 23503", async () => {
  const f = await crossSpacePair();
  await expect(
    first.db
      .update(routines)
      .set({ agentId: f.foreign.agentId })
      .where(
        and(eq(routines.spaceId, f.local.spaceId), eq(routines.id, f.localCreated.routine.id)),
      ),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db
      .update(routines)
      .set({ ownerAccountId: f.foreign.accountId })
      .where(
        and(eq(routines.spaceId, f.local.spaceId), eq(routines.id, f.localCreated.routine.id)),
      ),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("rejects routine secret references to another Space's routine or member with 23503", async () => {
  const f = await crossSpacePair();
  await expect(
    first.db.insert(routineSecrets).values({
      ...f.localSecret,
      routineId: f.foreignCreated.routine.id,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db
      .update(routineSecrets)
      .set({ accountId: f.foreign.accountId })
      .where(
        and(
          eq(routineSecrets.spaceId, f.local.spaceId),
          eq(routineSecrets.routineId, f.localCreated.routine.id),
        ),
      ),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("rejects routine occurrence references to another Space's routine or Run with 23503", async () => {
  const f = await crossSpacePair();
  await expect(
    first.db.insert(routineOccurrences).values({
      ...f.localOccurrence,
      id: crypto.randomUUID(),
      routineId: f.foreignCreated.routine.id,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(routineOccurrences).values({
      ...f.localOccurrence,
      id: crypto.randomUUID(),
      runId: f.foreignOutcome.runId,
      conversationId: f.foreignOutcome.conversationId,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("rejects a routine delivery referencing another Space's occurrence with 23503", async () => {
  const f = await crossSpacePair();
  // A complete foreign parent tuple must still fail when only its Space differs.
  await expect(
    first.db.insert(routineDeliveries).values({
      ...f.localDelivery,
      id: crypto.randomUUID(),
      routineId: f.foreignCreated.routine.id,
      occurrenceId: f.foreignOccurrence.id,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(routineDeliveries).values({
      ...f.localDelivery,
      id: crypto.randomUUID(),
      occurrenceId: f.foreignOccurrence.id,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("rejects routine event references to another Space's occurrence or Run with 23503", async () => {
  const f = await crossSpacePair();
  await expect(
    first.db.insert(routineEvents).values({
      ...f.localEvent,
      id: crypto.randomUUID(),
      routineId: f.foreignCreated.routine.id,
      occurrenceId: f.foreignOccurrence.id,
      runId: f.foreignOutcome.runId!,
      conversationId: f.foreignOutcome.conversationId!,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(routineEvents).values({
      ...f.localEvent,
      id: crypto.randomUUID(),
      occurrenceId: f.foreignOccurrence.id,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(routineEvents).values({
      ...f.localEvent,
      id: crypto.randomUUID(),
      runId: f.foreignOutcome.runId!,
      conversationId: f.foreignOutcome.conversationId!,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  const differentLocalRun = await service.test(
    f.local.scope,
    f.localCreated.routine.id,
    crypto.randomUUID(),
  );
  await expect(
    first.db.insert(routineEvents).values({
      ...f.localEvent,
      id: crypto.randomUUID(),
      runId: differentLocalRun.runId!,
      conversationId: differentLocalRun.conversationId!,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("rejects missing identity Spaces and active definitions bound to another Space's identity with 23503", async () => {
  const f = await crossSpacePair();
  await expect(
    first.db.insert(routineIdentities).values({
      spaceId: `missing-${crypto.randomUUID()}`,
      id: crypto.randomUUID(),
      createdAt: now,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  // Release the global active-definition ID while retaining its foreign-Space identity.
  await service.delete(f.foreign.scope, f.foreignCreated.routine.id);
  await expect(
    first.db.insert(routines).values({
      spaceId: f.local.spaceId,
      id: f.foreignCreated.routine.id,
      agentId: f.local.agentId,
      ownerAccountId: f.local.accountId,
      name: "Cross-Space identity",
      prompt: "Fixture",
      enabled: true,
      triggers: { webhook: true },
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("rejects cross-Space Run routine and generated inbound source references with 23503", async () => {
  const f = await crossSpacePair();
  const ownRun = and(
    eq(conversationRuns.spaceId, f.local.spaceId),
    eq(conversationRuns.id, f.localOccurrence.runId!),
  );
  await expect(
    first.db
      .update(conversationRuns)
      .set({
        routineId: f.foreignCreated.routine.id,
        inboundProvenance: null,
        inboundContent: null,
      })
      .where(ownRun),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db
      .update(conversationRuns)
      .set({
        routineId: f.foreignCreated.routine.id,
        inboundProvenance: {
          kind: "webhook",
          routineId: f.foreignCreated.routine.id,
          deliveryId: "external-delivery",
        },
      })
      .where(ownRun),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("retains a routine's scoped identity and Run provenance after deleting its active definition", async () => {
  const f = await fixture();
  const created = await service.create(f.scope, f.input);
  const outcome = await service.webhook(
    created.routine.id,
    created.webhookKey!,
    "retained-delivery",
    "{}",
  );
  await service.delete(f.scope, created.routine.id);
  expect(await first.db.select().from(routines).where(eq(routines.spaceId, f.spaceId))).toEqual([]);
  expect(
    await first.db.select().from(routineIdentities).where(eq(routineIdentities.spaceId, f.spaceId)),
  ).toEqual([expect.objectContaining({ id: created.routine.id, spaceId: f.spaceId })]);
  const [run] = await first.db
    .select()
    .from(conversationRuns)
    .where(and(eq(conversationRuns.spaceId, f.spaceId), eq(conversationRuns.id, outcome.runId!)));
  expect(run?.routineId).toBe(created.routine.id);
  expect(run?.inboundProvenance).toEqual({
    kind: "webhook",
    routineId: created.routine.id,
    deliveryId: "retained-delivery",
  });
});
