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

it("restores historical content as a new version while preserving the current archival state", async () => {
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
    archived: true,
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
  await repository.archive(owner, document.id, 4, false);
  expect((await repository.history(owner, document.id, undefined, 20))[0]).toMatchObject({
    reason: "unarchived",
    archived: false,
  });
  expect(await repository.restore(owner, document.id, 5, 2)).toMatchObject({
    revision: 6,
    archived: false,
    content: document.content,
  });
});

it("returns unchanged updates without another revision but refuses stale no-op requests", async () => {
  const original = input(),
    id = crypto.randomUUID();
  const saved = await repository.create(owner, id, original);
  const reordered = {
    ...original,
    project: { projectId: target.projectId, deviceId: target.deviceId },
  };
  expect(await repository.update(owner, id, 1, reordered)).toEqual(saved);
  expect(await repository.history(owner, id, undefined, 20)).toHaveLength(1);
  const updated = await repository.update(owner, id, 1, { ...original, content: "Changed" });
  await expect(
    repository.update(owner, id, 1, { ...original, content: "Changed" }),
  ).rejects.toMatchObject({ code: "CONTEXT_CONFLICT" });
  expect(await repository.update(owner, id, 2, { ...original, content: "Changed" })).toEqual(
    updated,
  );
  expect(await repository.history(owner, id, undefined, 20)).toHaveLength(2);
});

it("recovers creation before project revalidation and saves unchanged-project content after removal", async () => {
  let available = true;
  const service = new ContextLibraryService({
    repository,
    scope: "account",
    validateProject: async () => {
      if (!available) throw { code: "NOT_FOUND" };
    },
  });
  const original = input(),
    id = crypto.randomUUID();
  await service.create(owner, { requestId: id, document: original });
  available = false;
  await service.update(owner, {
    id,
    revision: 1,
    document: { ...original, content: "Edited after removal" },
  });
  const current = await service.archive(owner, { id, revision: 2, archived: true });
  expect(await service.create(owner, { requestId: id, document: original })).toEqual(current);
  await expect(
    service.create(owner, {
      requestId: id,
      document: { ...original, content: "Different create" },
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(
    service.create(stranger, { requestId: id, document: original }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(
    service.create(owner, { requestId: crypto.randomUUID(), document: original }),
  ).rejects.toMatchObject({ code: "CONTEXT_PROJECT_MISMATCH" });
  await expect(
    service.update(owner, {
      id,
      revision: 3,
      document: { ...original, project: { ...target, projectId: crypto.randomUUID() } },
    }),
  ).rejects.toMatchObject({ code: "CONTEXT_PROJECT_MISMATCH" });
  expect(await service.restore(owner, { id, revision: 3, version: 1 })).toMatchObject({
    revision: 4,
    archived: true,
    content: original.content,
  });
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
  expect(await repository.delete(quotaOwner, id, 2)).toEqual({ deleted: true });
  await repository.create(quotaOwner, crypto.randomUUID(), original);
  expect(await repository.list(quotaOwner)).toHaveLength(100);
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
  const snapshot = await service.resolve(owner, selection, target, "Task");
  await repository.update(owner, document.id, 1, { ...input(), content: "Changed text" });
  expect((await service.resolve(owner, selection, target, "Task")).sources[0]!.content).toBe(
    "Original rules",
  );
  expect(snapshot.sources[0]!.content).toBe("Original rules");
  await repository.update(owner, document.id, 2, {
    ...input(),
    project: { ...target, projectId: crypto.randomUUID() },
  });
  await expect(service.resolve(owner, selection, target, "Task")).rejects.toMatchObject({
    code: "CONTEXT_PROJECT_MISMATCH",
  });
  await repository.archive(owner, document.id, 3, true);
  await expect(service.resolve(owner, selection, target, "Task")).rejects.toMatchObject({
    code: "CONTEXT_ARCHIVED",
  });
  const rows = await connection.db
    .select()
    .from(contextVersion)
    .where(and(eq(contextVersion.userId, owner), eq(contextVersion.documentId, document.id)));
  expect(rows).toHaveLength(4);
});

it("does not read or migrate retired noncanonical document keys", async () => {
  const id = `abcdefab-${crypto.randomUUID().slice(9)}`,
    physicalId = id.toUpperCase();
  const original = input(),
    stamp = new Date();
  const legacy = {
    ...original,
    id: physicalId,
    project: { deviceId: target.deviceId.toUpperCase(), projectId: target.projectId.toUpperCase() },
    revision: 1,
    archived: false,
    createdAt: stamp.toISOString(),
    updatedAt: stamp.toISOString(),
  };
  await connection.db
    .insert(contextDocument)
    .values({ ...legacy, userId: owner, createdAt: stamp, updatedAt: stamp });
  await connection.db.insert(contextVersion).values({
    documentId: physicalId,
    userId: owner,
    revision: 1,
    body: { ...legacy, reason: "created" },
  });
  const service = new ContextLibraryService({ repository, scope: "account" });
  await expect(service.get(owner, { id })).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
  await expect(service.create(owner, { requestId: id, document: original })).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  expect(
    await connection.db
      .select({ id: contextVersion.documentId })
      .from(contextVersion)
      .where(eq(contextVersion.documentId, physicalId)),
  ).toEqual([{ id: physicalId }]);
});

it("prevents canonical document collisions in the database across owners", async () => {
  const collisionOwner = `memory-collision-${crypto.randomUUID()}`,
    id = `abcdefab-${crypto.randomUUID().slice(9)}`,
    physicalId = id.toUpperCase(),
    stamp = new Date();
  await connection.db.insert(user).values({
    id: collisionOwner,
    name: "Collision fixture",
    email: `${collisionOwner}@example.test`,
  });
  try {
    const saved = {
      ...input(),
      id: physicalId,
      revision: 1,
      archived: false,
      createdAt: stamp.toISOString(),
      updatedAt: stamp.toISOString(),
    };
    await connection.db.insert(contextDocument).values({
      ...input(),
      id: physicalId,
      userId: collisionOwner,
      revision: 1,
      archived: false,
    });
    await connection.db.insert(contextVersion).values({
      documentId: physicalId,
      userId: collisionOwner,
      revision: 1,
      body: { ...saved, reason: "created" },
    });
    for (const userId of [collisionOwner, stranger])
      await expect(
        connection.db.insert(contextDocument).values({
          ...input(),
          id,
          userId,
          revision: 1,
          archived: false,
        }),
      ).rejects.toMatchObject({ cause: { code: "23505" } });
    await expect(repository.create(collisionOwner, id, input())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(repository.findCreation(stranger, id, input())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  } finally {
    await connection.db.delete(user).where(eq(user.id, collisionOwner));
  }
});

it("uses the canonical unique index for existing and missing create IDs amid unrelated documents", async () => {
  const noiseOwner = `memory-query-${crypto.randomUUID()}`;
  await connection.db.insert(user).values({
    id: noiseOwner,
    name: "Query fixture",
    email: `${noiseOwner}@example.test`,
  });
  try {
    await connection.db.execute(sql`insert into ${contextDocument}
      (id,user_id,kind,name,category,content,project,revision,archived)
      select md5('memory-query-'||n),${noiseOwner},'memory','Unrelated','','Body',null,1,false
      from generate_series(1,6000)n`);
    const id = crypto.randomUUID();
    await repository.create(owner, id, input());
    await connection.db.execute(sql`analyze ${contextDocument}`);
    for (const requestId of [id, crypto.randomUUID()]) {
      const [row] = await connection.db.execute<{ "QUERY PLAN": unknown }>(
        sql`explain (analyze,format json) select * from ${contextDocument}
          where lower(id)=${requestId} limit 2`,
      );
      const plan = JSON.stringify(row?.["QUERY PLAN"]);
      expect(plan).toContain("context_document_canonical_id_idx");
      expect(plan).not.toContain('"Node Type":"Seq Scan"');
    }
    expect(await repository.findCreation(owner, id, input())).toMatchObject({ id });
    expect(await repository.findCreation(owner, crypto.randomUUID(), input())).toBeNull();
  } finally {
    await connection.db.delete(user).where(eq(user.id, noiseOwner));
  }
});

it("permanently deletes archived data with CAS while preserving frozen task context and identity", async () => {
  const id = crypto.randomUUID(),
    original = input();
  await repository.create(owner, id, original);
  const service = new ContextLibraryService({ repository, scope: "account" });
  const frozen = await service.resolve(owner, { sources: [{ id, revision: 1 }] }, target, "Task");
  await expect(repository.delete(owner, id, 1)).rejects.toMatchObject({
    code: "CONTEXT_NOT_ARCHIVED",
  });
  await expect(repository.delete(stranger, id, 1)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  await repository.archive(owner, id, 1, true);
  await expect(repository.delete(owner, id, 1)).rejects.toMatchObject({ code: "CONTEXT_CONFLICT" });
  expect(await repository.delete(owner, id, 2)).toEqual({ deleted: true });
  expect(await other.delete(owner, id, 2)).toEqual({ deleted: true });
  await expect(repository.get(owner, id)).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
  expect(await repository.readSources(owner, [{ id, revision: 1 }])).toEqual([]);
  expect(frozen.sources[0]?.content).toBe(original.content);
  expect(
    await connection.db.select().from(contextVersion).where(eq(contextVersion.documentId, id)),
  ).toEqual([]);
  for (const account of [owner, stranger])
    await expect(other.create(account, id, original)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
});
