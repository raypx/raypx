import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { adminAudit, mailConfiguration, user } from "@raypx/database/schema";
import { createApiClient } from "@raypx/client/api";
import { controlAuth } from "@raypx/control/testing";
import { createMailer } from "@raypx/email/server";
import { eq } from "drizzle-orm";
import { createApiApp } from "../../../src/routers/index.js";
import { createConfigurationReads } from "../../../src/config/reads.js";
import { AuditService } from "../../../src/administration/audit.js";
import { createAdministrationRepository } from "../../../src/administration/repository.js";
import {
  createResendSettings,
  databaseMailer,
  initializeResend,
} from "../../../src/config/resend.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const { db } = connection;
const origin = "https://web.example.test";
const secret = "synthetic-api-secret-for-mail-tests-only";

beforeAll(() => migrateDatabase(url));
afterAll(() => connection.close());

it("applies Resend settings live and keeps keys out of reads and durable audit entries", async () => {
  const administration = createAdministrationRepository(db);
  const audit = new AuditService(administration);
  const fixture = controlAuth(`resend-${crypto.randomUUID()}`);
  await db.insert(user).values(fixture.user);
  let role = "member";
  const deliver = vi.fn(async () => {});
  function createTestMailer(options: Parameters<typeof createMailer>[0]) {
    return createMailer({ ...options, transport: { send: deliver } });
  }
  const makeMailer = vi.fn(createTestMailer);
  const publish = vi.fn();
  const reads = createConfigurationReads({ publish, subscribe: () => () => {} });
  const mailer = databaseMailer(db, secret, reads, makeMailer);
  let clock = 0;
  const remoteFactory = vi.fn(createTestMailer);
  const remoteReads = createConfigurationReads(undefined, () => clock);
  const remote = databaseMailer(db, secret, remoteReads, remoteFactory);
  const message = { email: "recipient@example.test", url: "https://web.example.test/auth" };
  const app = createApiApp({
    audit,
    resendSettings: createResendSettings(db, secret, audit, reads),
    mailAvailable: mailer.available,
    authHandler: async () => {
      await mailer.sendVerification(message);
      return new Response(null, { status: 204 });
    },
    readSession: async () => ({ ...fixture, user: { ...fixture.user, role } }),
    allowedOrigins: [origin],
  });
  const client = (requestOrigin = origin) =>
    createApiClient({
      baseUrl: "https://api.example.test",
      headers: { origin: requestOrigin },
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    }).configuration;
  const verify = () => app.request("/api/auth/send-verification-email", { method: "POST" });
  const values = {
    from: "Raypx <no-reply@example.test>",
    defaultLocale: "zh",
    enabled: true,
  } as const;
  const apiKey = "re_synthetic_test_key";
  try {
    await expect(client().resend({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    role = "admin";
    expect(await client().resend({})).toEqual({ values: null, revision: 0, updatedAt: null });
    expect(await (await verify()).json()).toMatchObject({ code: "MAIL_NOT_CONFIGURED" });
    expect(await remote.available()).toBe(false);
    await expect(
      client("https://untrusted.example.test").updateResend({ values, apiKey, revision: 0 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(client().updateResend({ values, revision: 0 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const writes = await Promise.allSettled([
      client().updateResend({ values, apiKey, revision: 0 }),
      client().updateResend({ values, apiKey, revision: 0 }),
    ]);
    expect(writes.filter((write) => write.status === "fulfilled")).toHaveLength(1);
    expect(writes.find((write) => write.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    expect(publish.mock.calls).toEqual([[{ scope: "resend", revision: 1 }]]);
    expect(await remote.available()).toBe(false);
    clock += 5_000;
    expect(await Promise.all([remote.available(), remote.available()])).toEqual([true, true]);
    expect(remoteFactory).toHaveBeenCalledTimes(1);
    expect(await client().resend({})).toEqual({
      values,
      revision: 1,
      updatedAt: expect.any(String),
    });
    const [stored] = await db.select().from(mailConfiguration);
    expect(stored?.credentials).not.toContain(apiKey);
    expect(await initializeResend(db, secret, values, "re_unused")).toBe(false);
    expect((await verify()).status).toBe(204);
    expect(makeMailer).toHaveBeenLastCalledWith({ apiKey, from: values.from, defaultLocale: "zh" });
    expect(makeMailer).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(1);

    const newSender = { ...values, from: "other@example.test", defaultLocale: "en" } as const;
    await client().updateResend({ values: newSender, revision: 1 });
    await mailer.sendPasswordReset(message);
    expect(makeMailer).toHaveBeenLastCalledWith({
      apiKey,
      from: newSender.from,
      defaultLocale: "en",
    });
    const rotatedKey = "re_rotated_test_key";
    await client().updateResend({ values: newSender, apiKey: rotatedKey, revision: 2 });
    await remote.sendPasswordReset(message);
    expect(remoteFactory).toHaveBeenCalledTimes(1);
    remoteReads.committed("resend", 3);
    await remote.sendPasswordReset(message);
    expect(remoteFactory).toHaveBeenLastCalledWith({
      apiKey: rotatedKey,
      from: newSender.from,
      defaultLocale: "en",
    });
    expect((await verify()).status).toBe(204);
    expect(makeMailer).toHaveBeenLastCalledWith({
      apiKey: rotatedKey,
      from: newSender.from,
      defaultLocale: "en",
    });
    await client().updateResend({ values: { ...newSender, enabled: false }, revision: 3 });
    expect((await verify()).status).toBe(503);
    const { entries } = await administration.list({
      targetId: "resend",
      actorId: fixture.user.id,
      limit: 10,
    });
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({
      before: { mailEnabled: true },
      after: { mailEnabled: false },
    });
    expect(JSON.stringify(entries)).not.toContain(apiKey);
    expect(JSON.stringify(entries)).not.toContain(rotatedKey);
  } finally {
    await db.delete(mailConfiguration).where(eq(mailConfiguration.id, "resend"));
    await db.delete(adminAudit).where(eq(adminAudit.actorId, fixture.user.id));
    await db.delete(user).where(eq(user.id, fixture.user.id));
  }
});
