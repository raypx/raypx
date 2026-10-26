import { afterEach, expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { SqliteContextRepository } from "../../src/runtime/memory/repository";
import { createRuntime } from "../../src/runtime";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import type { ContextDocument, ContextDocumentInput } from "@raypx/memory";
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
it("persists immutable versions, CAS updates, archives and complete historical restores across reopen", async () => {
  const f = repository(),
    id = crypto.randomUUID();
  await f.store.create("device", id, document);
  expect(await f.store.archive("device", id, 1, false)).toMatchObject({ revision: 1 });
  expect(await f.store.history("device", id, undefined, 20)).toHaveLength(1);
  await f.store.update("device", id, 1, { ...document, content: "New reference" });
  await f.store.archive("device", id, 2, true);
  expect(await f.store.restore("device", id, 3, 1)).toMatchObject({
    revision: 4,
    archived: false,
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
  const raw = new Database(f.path);
  raw.query("UPDATE documents SET value=? WHERE id=?").run("private corrupted content", first.id);
  raw.close();
  await expect(f.store.get("device", first.id)).rejects.toMatchObject({
    code: "CONTEXT_UNAVAILABLE",
    message: "CONTEXT_UNAVAILABLE",
  });
});

const { fixture } = runtimeFixtures();
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
