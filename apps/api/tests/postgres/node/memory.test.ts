import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { contextDocument, contextVersion, controlOwner, user } from "@raypx/database/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ContextDocumentInput } from "@raypx/memory";
import { ContextLibraryService } from "@raypx/memory/server";
import { createContextRepository } from "../../../server/memory/repository.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 1 });
const secondConnection = connectDatabase(url, { max: 1 });
const repository = createContextRepository(connection.db);
const other = createContextRepository(secondConnection.db);
const owner = `memory-${crypto.randomUUID()}`;
const stranger = `other-memory-${crypto.randomUUID()}`;
const quotaOwner = `quota-memory-${crypto.randomUUID()}`;
const target = { deviceId: crypto.randomUUID(), projectId: crypto.randomUUID() };
const input = (): ContextDocumentInput => ({
  kind: "memory",
  name: "Project rules",
  category: "Engineering",
  content: "Original rules",
  project: target,
});
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db.insert(user).values(
    [owner, stranger, quotaOwner].map((id) => ({
      id,
      name: "Memory fixture",
      email: `${id}@example.test`,
    })),
  );
});
afterAll(async () => {
  try {
    await connection.db.delete(user).where(inArray(user.id, [owner, stranger, quotaOwner]));
  } finally {
    await Promise.all([connection.close(), secondConnection.close()]);
  }
});

it("isolates every document/history mutation and excludes content from summary reads", async () => {
  const document = await repository.create(owner, crypto.randomUUID(), input());
  expect(await repository.get(owner, document.id)).toEqual(document);
  const summary = (await repository.list(owner)).find((row) => row.id === document.id)!;
  expect(summary).not.toHaveProperty("content");
  expect(await repository.list(stranger)).toEqual([]);
  await expect(repository.get(stranger, document.id)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  await expect(repository.update(stranger, document.id, 1, input())).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  await expect(repository.archive(stranger, document.id, 1, true)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  await expect(repository.history(stranger, document.id, undefined, 20)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  await expect(repository.version(stranger, document.id, 1)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  await expect(repository.restore(stranger, document.id, 1, 1)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  expect(await repository.readSources(stranger, [{ id: document.id, revision: 1 }])).toEqual([]);
});

it("atomically compares revisions across connections and never changes immutable versions", async () => {
  const original = input();
  const document = await repository.create(owner, crypto.randomUUID(), original);
  const results = await Promise.allSettled([
    repository.update(owner, document.id, 1, { ...original, content: "First writer" }),
    other.update(owner, document.id, 1, { ...original, content: "Second writer" }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toMatchObject([
    { reason: { code: "CONTEXT_CONFLICT" } },
  ]);
  const history = await repository.history(owner, document.id, undefined, 20);
  expect(history.map((row) => row.revision)).toEqual([2, 1]);
  expect(history[1]).toEqual({ ...document, reason: "created" });
  expect((await repository.get(owner, document.id)).content).toBe(history[0]!.content);
});

it("restores the complete selected historical state as a new version and keeps archival history", async () => {
  const document = await repository.create(owner, crypto.randomUUID(), input());
  const archived = await repository.archive(owner, document.id, 1, true);
  expect(archived.revision).toBe(2);
  expect(await repository.archive(owner, document.id, 2, true)).toEqual(archived);
  const revised = await repository.update(owner, document.id, 2, {
    ...input(),
    kind: "template",
    content: "Later template",
    project: null,
  });
  expect(revised).toMatchObject({ revision: 3, archived: true });
  const restored = await repository.restore(owner, document.id, 3, 1);
  expect(restored).toMatchObject({
    revision: 4,
    archived: false,
    kind: "memory",
    content: document.content,
    project: target,
    createdAt: document.createdAt,
  });
  const history = await repository.history(owner, document.id, undefined, 20);
  expect(history[0]).toEqual({ ...restored, reason: "restored", restoredFrom: 1 });
  expect(history.map((version) => version.reason)).toEqual([
    "restored",
    "updated",
    "archived",
    "created",
  ]);
  await expect(repository.restore(owner, document.id, 3, 1)).rejects.toMatchObject({
    code: "CONTEXT_CONFLICT",
  });
  await expect(repository.restore(owner, document.id, 4, 900)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  expect((await repository.get(owner, document.id)).revision).toBe(4);
});

it("replays creation against revision one after edits/archival and rejects payload or owner reuse", async () => {
  const original = input(),
    id = crypto.randomUUID();
  const results = await Promise.all([
    repository.create(owner, id, original),
    other.create(owner, id, original),
  ]);
  expect(results[0]).toEqual(results[1]);
  await repository.update(owner, id, 1, { ...original, name: "New name" });
  const archived = await repository.archive(owner, id, 2, true);
  const reordered = {
    ...original,
    project: { projectId: target.projectId, deviceId: target.deviceId },
  };
  expect(await repository.create(owner, id, reordered)).toEqual(archived);
  await expect(
    repository.create(owner, id, { ...original, content: "Different request" }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(repository.create(stranger, id, original)).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  expect(await repository.history(owner, id, undefined, 20)).toHaveLength(3);
});

it("counts archived documents toward the quota but allows an existing create retry before the limit", async () => {
  const original = input(),
    id = crypto.randomUUID();
  await repository.create(quotaOwner, id, original);
  await repository.archive(quotaOwner, id, 1, true);
  await connection.db.insert(contextDocument).values(
    Array.from({ length: 99 }, () => ({
      id: crypto.randomUUID(),
      userId: quotaOwner,
      ...input(),
      revision: 1,
      archived: true,
    })),
  );
  expect((await repository.create(quotaOwner, id, original)).archived).toBe(true);
  await expect(repository.create(quotaOwner, crypto.randomUUID(), original)).rejects.toMatchObject({
    code: "CONTEXT_LIMIT",
  });
});

it("paginates immutable versions newest-first with an exclusive revision cursor", async () => {
  const original = input(),
    id = crypto.randomUUID();
  await repository.create(owner, id, original);
  for (let revision = 1; revision < 23; revision++)
    await repository.update(owner, id, revision, {
      ...original,
      content: `Revision ${revision + 1}`,
    });
  const page = await repository.history(owner, id, undefined, 20);
  expect(page).toHaveLength(20);
  expect(page.map((version) => version.revision)).toEqual(
    Array.from({ length: 20 }, (_, index) => 23 - index),
  );
  expect(
    (await repository.history(owner, id, page.at(-1)!.revision, 20)).map(
      (version) => version.revision,
    ),
  ).toEqual([3, 2, 1]);
});

it("reads historical snapshots without waiting for an account write lock and invalidates moved/archived sources", async () => {
  const document = await repository.create(owner, crypto.randomUUID(), input());
  let release!: () => void, ready!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const locked = connection.db.transaction(async (tx) => {
    await tx.execute(sql`select user_id from ${controlOwner} where user_id=${owner} for update`);
    ready();
    await gate;
  });
  await acquired;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const sources = await Promise.race([
      other.readSources(owner, [{ id: document.id, revision: 1 }]),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Context read waited for account lock")), 1500);
      }),
    ]);
    expect(sources).toMatchObject([
      { current: { revision: 1 }, version: { revision: 1, content: "Original rules" } },
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    release();
    await locked;
  }
  const service = new ContextLibraryService({ repository, scope: "account" });
  const selection = { sources: [{ id: document.id, revision: 1 }] };
  const snapshot = await service.resolve(owner, selection, target);
  await repository.update(owner, document.id, 1, { ...input(), content: "Changed text" });
  expect((await service.resolve(owner, selection, target)).sources[0]!.content).toBe(
    "Original rules",
  );
  expect(snapshot.sources[0]!.content).toBe("Original rules");
  await repository.update(owner, document.id, 2, {
    ...input(),
    project: { ...target, projectId: crypto.randomUUID() },
  });
  await expect(service.resolve(owner, selection, target)).rejects.toMatchObject({
    code: "CONTEXT_PROJECT_MISMATCH",
  });
  await repository.archive(owner, document.id, 3, true);
  await expect(service.resolve(owner, selection, target)).rejects.toMatchObject({
    code: "CONTEXT_ARCHIVED",
  });
  const rows = await connection.db
    .select()
    .from(contextVersion)
    .where(and(eq(contextVersion.userId, owner), eq(contextVersion.documentId, document.id)));
  expect(rows).toHaveLength(4);
});
