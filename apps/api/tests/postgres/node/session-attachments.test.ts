import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  adminAudit,
  session,
  sessionAttachment,
  storageConfiguration,
  user,
} from "@raypx/database/schema";
import type { AuthSession } from "@raypx/core/auth";
import { eq } from "drizzle-orm";
import { ControlService } from "@raypx/control";
import { createControlRepository } from "@raypx/control/postgres";
import { connected, controlAuth } from "@raypx/control/testing";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../helpers/app.js";
import { createConfigReads } from "../../../src/config/reads.js";
import { AuditService } from "../../../src/admin/audit.js";
import { createAdministrationRepository } from "../../../src/admin/repository.js";
import { cleanupExpired } from "../../../src/jobs/cleanup.js";
import {
  createSessionAttachments,
  withSessionAttachments,
} from "../../../src/storage/attachments.js";
import {
  databaseStorage,
  createStorageSettings,
  saveStorageConfiguration,
  storageConfigSchema,
} from "../../../src/storage/config.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("An isolated *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const { db } = connection;
const repository = createControlRepository(db);
const seed = new ControlService(repository);
const auth = controlAuth(`uploads-${crypto.randomUUID()}`);
const key = "synthetic-api-secret-for-attachment-tests-only";
const origin = "https://web.example.test";

beforeAll(async () => {
  await migrateDatabase(url);
  await db.insert(user).values(auth.user);
  await db.insert(session).values({
    id: auth.session.id,
    userId: auth.user.id,
    expiresAt: auth.session.expiresAt,
    token: crypto.randomUUID(),
  });
});
afterAll(async () => {
  try {
    await db.delete(adminAudit).where(eq(adminAudit.actorId, auth.user.id));
    await db.delete(user).where(eq(user.id, auth.user.id));
  } finally {
    await connection.close();
  }
});

it("audits storage changes atomically without returning credentials and rejects stale writes", async () => {
  const administration = createAdministrationRepository(db);
  const audit = new AuditService(administration);
  let current: AuthSession = auth;
  const reads = createConfigReads();
  const storage = databaseStorage(db, key, reads);
  const app = createApiApp({
    audit,
    storageSettings: createStorageSettings(db, key, audit, reads),
    authHandler: async () => new Response(null, { status: 404 }),
    readSession: async () => current,
    allowedOrigins: [origin],
  });
  const client = (requestOrigin = origin) =>
    createApiClient({
      baseUrl: "https://api.example.test",
      headers: { origin: requestOrigin },
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    }).configuration;
  const values = {
    endpoint: "https://s3.us-east-1.amazonaws.com",
    region: "us-east-1",
    bucket: "configuration-fixture",
    enabled: true,
  };
  const credentials = {
    accessKeyId: "admin-fixture-access",
    secretAccessKey: "admin-fixture-secret",
  };
  const input = { values, credentials, revision: 0 };
  try {
    await expect(client().storage({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    current = { ...auth, user: { ...auth.user, role: "admin" } };
    expect(await client().storage({})).toEqual({ values: null, revision: 0, updatedAt: null });
    await expect(
      client("https://untrusted.example.test").updateStorage(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      client().updateStorage({
        ...input,
        values: { ...values, endpoint: "https://s3.us-east-1.amazonaws.com.example.test" },
      }),
    ).rejects.toMatchObject({
      data: { error: { code: "STORAGE_ENDPOINT_REQUIRES_OPERATOR" } },
    });
    const writes = await Promise.allSettled([
      client().updateStorage(input),
      client().updateStorage(input),
    ]);
    expect(writes.filter((write) => write.status === "fulfilled")).toHaveLength(1);
    expect(writes.find((write) => write.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    const configured = await client().storage({});
    expect(configured).toEqual({ values, revision: 1, updatedAt: expect.any(String) });
    expect(await storage.readCached()).toMatchObject({ available: true });
    const [before] = await db
      .select()
      .from(storageConfiguration)
      .where(eq(storageConfiguration.bucket, values.bucket));
    await expect(
      client().updateStorage({ revision: 1, values: { ...values, bucket: "different-fixture" } }),
    ).rejects.toMatchObject({ data: { error: { code: "INVALID_INPUT" } } });
    const disabled = await client().updateStorage({
      revision: 1,
      values: { ...values, enabled: false },
    });
    expect(disabled).toMatchObject({ revision: 2, values: { enabled: false } });
    expect(await storage.readCached()).toBeNull();
    const [after] = await db
      .select()
      .from(storageConfiguration)
      .where(eq(storageConfiguration.bucket, values.bucket));
    expect(after?.credentials).toBe(before?.credentials);
    const auditRows = await db.select().from(adminAudit).where(eq(adminAudit.targetId, "s3"));
    expect(auditRows).toHaveLength(2);
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: "success",
          before: null,
          after: { storageEnabled: true },
        }),
        expect.objectContaining({
          outcome: "success",
          before: { storageEnabled: true },
          after: { storageEnabled: false },
        }),
      ]),
    );
    const serialized = JSON.stringify(auditRows);
    expect(serialized).not.toContain(credentials.accessKeyId);
    expect(serialized).not.toContain(credentials.secretAccessKey);
    await saveStorageConfiguration(db, key, { ...values, ...credentials });
    expect(await client().storage({})).toMatchObject({ revision: 3, values: { enabled: false } });
  } finally {
    await db.delete(storageConfiguration).where(eq(storageConfiguration.bucket, values.bucket));
  }
});

it("loads encrypted S3 settings from PostgreSQL and routes private attachment context", async () => {
  const writes: { path: string; text: string; authorized: boolean }[] = [];
  let bucketStatus = 200;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      writes.push({
        path: new URL(request.url).pathname,
        text: await request.text(),
        authorized:
          request.headers.get("authorization")?.includes("Credential=fixture-key/") ?? false,
      });
      return new Response(null, { status: bucketStatus });
    },
  });
  const endpoint = server.url.origin;
  try {
    const project = await connected(seed, auth);
    const target = { deviceId: project.grant.deviceId, projectId: project.input.projectId };
    let now = 0;
    const storage = databaseStorage(
      db,
      key,
      createConfigReads(undefined, () => now),
    );
    const attachments = createSessionAttachments(db, storage, seed.projects);
    const resolve = withSessionAttachments(db, async () => ({
      capturedAt: new Date().toISOString(),
      sources: [],
    }));
    const control = new ControlService(repository, Date.now, resolve);
    let current: typeof auth | null = auth;
    const app = createApiApp({
      attachments,
      authHandler: async () => new Response(null, { status: 404 }),
      readSession: async () => current,
      allowedOrigins: [origin],
    });
    const client = (requestOrigin = origin) =>
      createApiClient({
        baseUrl: "https://api.example.test",
        headers: { origin: requestOrigin },
        fetch: async (input, init) => app.fetch(new Request(input, init)),
      }).attachments;
    const text = "A UTF-8 attachment\n测试";
    const input = { ...target, name: "notes.md", data: Buffer.from(text).toString("base64") };
    expect(await client().status({})).toEqual({ enabled: false });
    current = null;
    await expect(client().upload(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    current = auth;
    await expect(client("https://untrusted.example.test").upload(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(client().upload({ ...input, data: "A".repeat(48_000) })).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    await saveStorageConfiguration(
      db,
      key,
      storageConfigSchema.parse({
        endpoint,
        bucket: "private-files",
        accessKeyId: "fixture-key",
        secretAccessKey: "fixture-secret",
      }),
    );
    const [row] = await db
      .select()
      .from(storageConfiguration)
      .where(eq(storageConfiguration.endpoint, endpoint));
    expect(row?.credentials).toBeTruthy();
    expect(row?.credentials).not.toContain("fixture-secret");
    await expect(databaseStorage(db, "wrong deployment secret").read()).rejects.toMatchObject({
      name: "OperationError",
    });
    expect(await client().status({})).toEqual({ enabled: false });
    now = 5_000;
    expect(await client().status({})).toEqual({ enabled: true });
    await expect(
      client().upload({ ...input, projectId: crypto.randomUUID() }),
    ).rejects.toMatchObject({
      data: { error: { code: "CONTEXT_PROJECT_MISMATCH" } },
    });
    await expect(client().upload({ ...input, data: "/w==" })).rejects.toMatchObject({
      data: { error: { code: "ATTACHMENT_INVALID" } },
    });
    expect(writes).toHaveLength(0);
    const source = await client().upload(input);
    expect(writes).toEqual([
      {
        path: `/private-files/session-attachments/${source.id}`,
        text,
        authorized: true,
      },
    ]);
    expect(source).toEqual({ id: source.id, revision: 1, attachment: "notes.md" });
    const selection = { sources: [source] };
    const requestId = crypto.randomUUID();
    const command = await control.commands.route(auth.user.id, requestId, {
      method: "tasks.create",
      input: {
        ...target,
        id: requestId,
        provider: "codex",
        mode: "run",
        prompt: "Summarize it.",
        contextSelection: selection,
      },
    });
    expect(command.context?.sources).toEqual([
      {
        id: source.id,
        revision: 1,
        name: "notes.md",
        kind: "attachment",
        scope: "account",
        project: target,
        content: text,
      },
    ]);
    await expect(resolve("other-account", selection, target, "")).rejects.toMatchObject({
      code: "CONTEXT_NOT_FOUND",
    });
    await expect(
      resolve(auth.user.id, selection, { ...target, projectId: crypto.randomUUID() }, ""),
    ).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
    await db
      .update(sessionAttachment)
      .set({ expiresAt: new Date(0) })
      .where(eq(sessionAttachment.id, source.id));
    await expect(resolve(auth.user.id, selection, target, "")).rejects.toMatchObject({
      code: "CONTEXT_NOT_FOUND",
    });
    expect((await cleanupExpired(db)).attachments).toBeGreaterThan(0);
    bucketStatus = 404;
    await expect(client().upload(input)).rejects.toMatchObject({
      data: { error: { code: "STORAGE_UNAVAILABLE" } },
    });
    expect(
      await db.select().from(sessionAttachment).where(eq(sessionAttachment.userId, auth.user.id)),
    ).toHaveLength(0);
  } finally {
    await server.stop(true);
    await db.delete(storageConfiguration).where(eq(storageConfiguration.endpoint, endpoint));
  }
});
