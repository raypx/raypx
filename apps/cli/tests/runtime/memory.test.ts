import { afterEach, expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { SqliteContextRepository } from "../../src/runtime/memory/repository";
import { createRuntime } from "../../src/runtime";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import type { ContextDocument, ContextDocumentInput } from "@raypx/memory";
import { ContextLibraryService } from "@raypx/memory/server";
import { runtimeFixtures } from "../helpers/runtime";

const roots: string[] = [],
  stores: SqliteContextRepository[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function repository() {
  const root = mkdtempSync(join(tmpdir(), "raypx-memory-"));
  roots.push(root);
  const path = join(root, "memory.sqlite");
  const store = new SqliteContextRepository(path);
  stores.push(store);
  return { root, path, store };
}
const document: ContextDocumentInput = {
  kind: "memory",
  name: "Conventions",
  category: "Project",
  content: "Original reference",
  project: null,
};
it("persists immutable versions and restores content without changing archival state across reopen", async () => {
  const f = repository(),
    id = crypto.randomUUID();
  await f.store.create("device", id, document);
  expect(await f.store.archive("device", id, 1, false)).toMatchObject({ revision: 1 });
  expect(await f.store.history("device", id, undefined, 20)).toHaveLength(1);
  await f.store.update("device", id, 1, { ...document, content: "New reference" });
  await f.store.archive("device", id, 2, true);
  expect(await f.store.restore("device", id, 3, 1)).toMatchObject({
    revision: 4,
    archived: true,
    content: document.content,
  });
  expect(
    (await f.store.history("device", id, undefined, 20)).map((version) => [
      version.revision,
      version.reason,
      version.restoredFrom,
    ]),
  ).toEqual([
    [4, "restored", 1],
    [3, "archived", undefined],
    [2, "updated", undefined],
    [1, "created", undefined],
  ]);
  f.store.close();
  stores.splice(stores.indexOf(f.store), 1);
  const reopened = new SqliteContextRepository(f.path);
  stores.push(reopened);
  expect(await reopened.get("device", id)).toMatchObject({
    revision: 4,
    content: document.content,
  });
  await expect(reopened.get("other", id)).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
  expect(await reopened.create("device", id, document)).toMatchObject({ revision: 4 });
  await expect(
    reopened.create("device", id, { ...document, name: "Different" }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await reopened.archive("device", id, 4, false);
  expect((await reopened.history("device", id, undefined, 20))[0]).toMatchObject({
    reason: "unarchived",
    archived: false,
  });
  // The selected revision was archived; a content restore must keep the current active state.
  expect(await reopened.restore("device", id, 5, 3)).toMatchObject({
    revision: 6,
    archived: false,
    content: "New reference",
  });
});

it("does not append unchanged updates and checks stale revisions before the no-op", async () => {
  const f = repository(),
    id = crypto.randomUUID();
  const saved = await f.store.create("device", id, document);
  expect(await f.store.update("device", id, 1, { ...document })).toEqual(saved);
  expect(await f.store.history("device", id, undefined, 20)).toHaveLength(1);
  const revised = await f.store.update("device", id, 1, { ...document, content: "Changed" });
  await expect(
    f.store.update("device", id, 1, { ...document, content: "Changed" }),
  ).rejects.toMatchObject({ code: "CONTEXT_CONFLICT" });
  expect(await f.store.update("device", id, 2, { ...document, content: "Changed" })).toEqual(
    revised,
  );
  expect(await f.store.history("device", id, undefined, 20)).toHaveLength(2);
});

it("recovers retry IDs after target removal while allowing same-project edits and rejecting new targets", async () => {
  const f = repository(),
    id = crypto.randomUUID();
  const target = { deviceId: crypto.randomUUID(), projectId: crypto.randomUUID() };
  const original = { ...document, project: target };
  let available = true;
  const service = new ContextLibraryService({
    repository: f.store,
    scope: "device",
    validateProject: async () => {
      if (!available) throw { code: "NOT_FOUND" };
    },
  });
  await service.create("device", { requestId: id, document: original });
  available = false;
  await service.update("device", {
    id,
    revision: 1,
    document: { ...original, content: "Edited after removal" },
  });
  const current = await service.archive("device", { id, revision: 2, archived: true });
  expect(await service.create("device", { requestId: id, document: original })).toEqual(current);
  await expect(
    service.create("device", {
      requestId: id,
      document: { ...original, content: "Changed create" },
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(
    service.create("other", { requestId: id, document: original }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(
    service.create("device", { requestId: crypto.randomUUID(), document: original }),
  ).rejects.toMatchObject({ code: "CONTEXT_PROJECT_MISMATCH" });
  await expect(
    service.update("device", {
      id,
      revision: 3,
      document: { ...original, project: { ...target, projectId: crypto.randomUUID() } },
    }),
  ).rejects.toMatchObject({ code: "CONTEXT_PROJECT_MISMATCH" });
  expect(await service.restore("device", { id, revision: 3, version: 1 })).toMatchObject({
    revision: 4,
    archived: true,
    content: original.content,
  });
});
it("allows only one revision winner across two connections", async () => {
  const f = repository(),
    second = new SqliteContextRepository(f.path),
    id = crypto.randomUUID();
  stores.push(second);
  await f.store.create("device", id, document);
  const results = await Promise.allSettled([
    f.store.update("device", id, 1, { ...document, content: "First" }),
    second.update("device", id, 1, { ...document, content: "Second" }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { code: "CONTEXT_CONFLICT" },
  });
  expect(await f.store.history("device", id, undefined, 20)).toHaveLength(2);
});
it("enforces the complete document quota including archived entries and hides corrupted storage details", async () => {
  const f = repository();
  for (let i = 0; i < 100; i++) await f.store.create("device", crypto.randomUUID(), document);
  const first = (await f.store.list("device"))[0]!;
  await f.store.archive("device", first.id, 1, true);
  await expect(f.store.create("device", crypto.randomUUID(), document)).rejects.toMatchObject({
    code: "CONTEXT_LIMIT",
  });
  expect(await f.store.delete("device", first.id, 2)).toEqual({ deleted: true });
  const replacement = await f.store.create("device", crypto.randomUUID(), document);
  expect(await f.store.list("device")).toHaveLength(100);
  const raw = new Database(f.path);
  raw
    .query("UPDATE documents SET value=? WHERE id=?")
    .run("private corrupted content", replacement.id);
  raw.close();
  await expect(f.store.get("device", replacement.id)).rejects.toMatchObject({
    code: "CONTEXT_UNAVAILABLE",
    message: "CONTEXT_UNAVAILABLE",
  });
});

const { fixture } = runtimeFixtures();
it("keeps legacy uppercase primary keys connected to versions while returning canonical IDs", async () => {
  const f = repository(),
    id = `abcdefab-${crypto.randomUUID().slice(9)}`,
    physicalId = id.toUpperCase();
  const target = {
    deviceId: `abcdefab-${crypto.randomUUID().slice(9)}`,
    projectId: `abcdefab-${crypto.randomUUID().slice(9)}`,
  };
  const original = { ...document, project: target };
  const legacy = {
    ...original,
    id: physicalId,
    project: { deviceId: target.deviceId.toUpperCase(), projectId: target.projectId.toUpperCase() },
    revision: 1,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const raw = new Database(f.path);
  raw
    .query("INSERT INTO documents VALUES (?,?,?)")
    .run("device", physicalId, JSON.stringify(legacy));
  raw
    .query("INSERT INTO versions VALUES (?,?,?,?)")
    .run("device", physicalId, 1, JSON.stringify({ ...legacy, reason: "created" }));
  const service = new ContextLibraryService({ repository: f.store, scope: "device" });
  try {
    expect(await service.get("device", { id })).toMatchObject({ id, revision: 1, project: target });
    expect(await service.create("device", { requestId: id, document: original })).toMatchObject({
      id,
      revision: 1,
    });
    await service.update("device", {
      id,
      revision: 1,
      document: { ...original, content: "New text" },
    });
    expect((await service.history("device", { id })).map((version) => version.revision)).toEqual([
      2, 1,
    ]);
    expect(
      (await service.resolve("device", { sources: [{ id, revision: 1 }] }, target, "Task"))
        .sources[0],
    ).toMatchObject({ id, content: document.content, project: target });
    await service.archive("device", { id, revision: 2, archived: true });
    expect(await service.restore("device", { id, revision: 3, version: 1 })).toMatchObject({
      id,
      revision: 4,
      archived: true,
    });
    expect(raw.query("SELECT id FROM documents WHERE owner=?").all("device")).toEqual([
      { id: physicalId },
    ]);
    expect(raw.query("SELECT DISTINCT id FROM versions WHERE owner=?").all("device")).toEqual([
      { id: physicalId },
    ]);
    expect((await service.history("device", { id })).map((version) => version.revision)).toEqual([
      4, 3, 2, 1,
    ]);
  } finally {
    raw.close();
  }
});

it("fails closed when legacy keys differ only by case instead of overwriting a selected source", async () => {
  const f = repository(),
    id = `abcdefab-${crypto.randomUUID().slice(9)}`,
    physicalId = id.toUpperCase();
  const legacy = {
    ...document,
    id: physicalId,
    revision: 1,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const raw = new Database(f.path);
  for (const key of [id, physicalId])
    raw
      .query("INSERT INTO documents VALUES (?,?,?)")
      .run("device", key, JSON.stringify({ ...legacy, id: key }));
  // Only one physical row has the requested version; the other must still make resolution ambiguous.
  raw
    .query("INSERT INTO versions VALUES (?,?,?,?)")
    .run("device", physicalId, 1, JSON.stringify({ ...legacy, reason: "created" }));
  raw.close();
  await expect(f.store.get("device", id)).rejects.toMatchObject({ code: "CONTEXT_CONFLICT" });
  await expect(f.store.update("device", id, 1, document)).rejects.toMatchObject({
    code: "CONTEXT_CONFLICT",
  });
  await expect(f.store.history("device", id, undefined, 20)).rejects.toMatchObject({
    code: "CONTEXT_CONFLICT",
  });
  await expect(f.store.list("device")).rejects.toMatchObject({ code: "CONTEXT_CONFLICT" });
  await expect(f.store.readSources("device", [{ id, revision: 1 }])).rejects.toMatchObject({
    code: "CONTEXT_CONFLICT",
  });
  await expect(f.store.create("device", id, document)).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  await expect(f.store.findCreation("other", id, document)).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
});

it("keeps memory IPC local, validates authorized project targets and resolves pinned revisions", async () => {
  const f = await fixture();
  await f.runtime.request("agents.configure", { rootId: f.grant.id, providers: ["codex"] });
  const device = await f.runtime.agents.localDevice(LOCAL_WORKSPACE_ID),
    target = { deviceId: device.id, projectId: f.grant.id };
  const saved = (await f.runtime.request("memory.create", {
    requestId: crypto.randomUUID(),
    document: { ...document, project: target },
  })) as ContextDocument;
  await f.runtime.request("memory.update", {
    id: saved.id,
    revision: 1,
    document: { ...document, project: target, content: "Updated" },
  });
  expect(
    await f.runtime.request("memory.resolve", {
      selection: { sources: [{ id: saved.id, revision: 1 }] },
      target,
      prompt: "Task",
    }),
  ).toMatchObject({ sources: [{ content: document.content, revision: 1, scope: "device" }] });
  await expect(
    f.runtime.request("memory.resolve", {
      selection: { sources: [{ id: saved.id, revision: 1 }] },
      target: { ...target, deviceId: crypto.randomUUID() },
    }),
  ).rejects.toMatchObject({ code: "CONTEXT_PROJECT_MISMATCH" });
  await expect(
    f.runtime.request("memory.list", { accountId: "another-account" }),
  ).rejects.toMatchObject({ code: "INVALID_CONTEXT" });
  await expect(
    f.runtime.request("memory.resolve", {
      selection: { sources: [{ id: saved.id, revision: 1 }] },
      target,
      prompt: "x".repeat(32000),
    }),
  ).rejects.toMatchObject({ code: "CONTEXT_TOO_LARGE" });
  await f.runtime.request("memory.archive", { id: saved.id, revision: 2, archived: true });
  await expect(
    f.runtime.request("memory.resolve", {
      selection: { sources: [{ id: saved.id, revision: 1 }] },
      target,
    }),
  ).rejects.toMatchObject({ code: "CONTEXT_ARCHIVED" });
  await f.runtime.close();
  const reopened = createRuntime({ dataDir: f.dir });
  try {
    expect(await reopened.request("memory.get", { id: saved.id })).toMatchObject({
      revision: 3,
      archived: true,
    });
  } finally {
    await reopened.close();
  }
});

it("permanently deletes only owned archived revisions, erases versions and reserves the ID", async () => {
  const f = repository(),
    id = crypto.randomUUID();
  const service = new ContextLibraryService({ repository: f.store, scope: "device" });
  await f.store.create("device", id, document);
  const frozen = await service.resolve(
    "device",
    { sources: [{ id, revision: 1 }] },
    { deviceId: crypto.randomUUID(), projectId: crypto.randomUUID() },
    "Task",
  );
  await expect(f.store.delete("device", id, 1)).rejects.toMatchObject({
    code: "CONTEXT_NOT_ARCHIVED",
  });
  await expect(f.store.delete("other", id, 1)).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
  await f.store.archive("device", id, 1, true);
  await expect(f.store.delete("device", id, 1)).rejects.toMatchObject({ code: "CONTEXT_CONFLICT" });
  expect(await f.store.delete("device", id, 2)).toEqual({ deleted: true });
  expect(await f.store.delete("device", id, 2)).toEqual({ deleted: true });
  await expect(f.store.get("device", id)).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
  await expect(f.store.history("device", id, undefined, 20)).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  expect(frozen.sources[0]?.content).toBe(document.content);
  await expect(f.store.readSources("device", [{ id, revision: 1 }])).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  for (const owner of ["device", "other"])
    await expect(f.store.create(owner, id.toUpperCase(), document)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  const raw = new Database(f.path);
  try {
    expect(raw.query("SELECT * FROM versions WHERE id=?").all(id)).toEqual([]);
    expect(raw.query("SELECT * FROM documents WHERE id=?").all(id)).toEqual([]);
    expect(raw.query("SELECT * FROM deleted_documents WHERE id=?").get(id)).toEqual({
      id,
      owner: "device",
      revision: 2,
    });
  } finally {
    raw.close();
  }
});
