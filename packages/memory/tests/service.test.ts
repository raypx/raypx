import { expect, it, vi } from "vite-plus/test";
import { ContextError, type ContextDocument, type ContextVersion } from "../src/index.js";
import { ContextLibraryService, type ContextLibraryRepository } from "../src/server.js";

const target = {
  deviceId: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
};
const id = "33333333-3333-4333-8333-333333333333";
const now = "2026-10-26T00:00:00.000Z";
function fixture(scope: "account" | "device" = "account") {
  const document: ContextDocument = {
    id,
    kind: "memory",
    name: "Project rules",
    category: "Engineering",
    content: "Run meaningful tests",
    project: target,
    revision: 2,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  const version: ContextVersion = {
    ...document,
    revision: 1,
    content: "Original instructions",
    reason: "created",
  };
  const repository = {
    list: vi.fn(async () => [document]),
    delete: vi.fn<ContextLibraryRepository["delete"]>(async () => ({ deleted: true })),
    get: vi.fn(async () => document),
    version: vi.fn(async () => version),
    findCreation: vi.fn<ContextLibraryRepository["findCreation"]>(async () => null),
    create: vi.fn(async () => document),
    update: vi.fn(async () => document),
    archive: vi.fn(async () => document),
    history: vi.fn(async () => [version]),
    restore: vi.fn(async () => document),
    readSources: vi.fn(async () => [{ current: document, version }]),
  } satisfies ContextLibraryRepository;
  const validateProject = vi.fn(async () => {});
  const service = new ContextLibraryService({
    repository,
    scope,
    validateProject,
    now: () => Date.parse(now),
  });
  const selection = { sources: [{ id, revision: 1 }] };
  return { document, version, repository, validateProject, service, selection };
}

it("validates every use case and keeps ownership at the injected repository boundary", async () => {
  const f = fixture();
  await f.service.list("owner");
  await f.service.get("owner", { id });
  await f.service.history("owner", { id });
  expect(f.repository.list).toHaveBeenCalledWith("owner");
  expect(f.repository.get).toHaveBeenCalledWith("owner", id);
  expect(f.repository.history).toHaveBeenCalledWith("owner", id, undefined, 20);
  expect(() => f.service.list("")).toThrowError("AUTH_REQUIRED");
  await expect(
    f.service.create("owner", { requestId: id, document: { ...f.document, project: target } }),
  ).rejects.toMatchObject({ code: "INVALID_CONTEXT" });
  expect(f.repository.create).not.toHaveBeenCalled();
});

it("validates project ownership before writes and restore before committing its new revision", async () => {
  const f = fixture();
  const document = {
    kind: f.document.kind,
    name: "  New name  ",
    category: " Rules ",
    content: " Text ",
    project: target,
  };
  await f.service.create("owner", { requestId: id, document });
  expect(f.repository.create).toHaveBeenCalledWith("owner", id, {
    ...document,
    name: "New name",
    category: "Rules",
    content: "Text",
  });
  await f.service.update("owner", { id, revision: 2, document });
  await f.service.archive("owner", { id, revision: 2, archived: true });
  await f.service.restore("owner", { id, revision: 2, version: 1 });
  expect(f.repository.restore).toHaveBeenCalledWith("owner", id, 2, 1);
  f.validateProject.mockRejectedValueOnce({ code: "NOT_FOUND" });
  f.version.project = { ...target, projectId: crypto.randomUUID() };
  await expect(
    f.service.restore("stranger", { id, revision: 2, version: 1 }),
  ).rejects.toMatchObject({ code: "CONTEXT_PROJECT_MISMATCH" });
  expect(f.repository.restore).toHaveBeenCalledTimes(1);
});

it("recovers a matching create before checking an expired project and keeps new/conflicting creates protected", async () => {
  const f = fixture();
  const document = {
    kind: f.document.kind,
    name: f.document.name,
    category: f.document.category,
    content: f.document.content,
    project: target,
  };
  f.document.archived = true;
  f.repository.findCreation.mockResolvedValueOnce(f.document);
  f.validateProject.mockRejectedValue({ code: "NOT_FOUND" });
  expect(await f.service.create("owner", { requestId: id, document })).toBe(f.document);
  expect(f.validateProject).not.toHaveBeenCalled();
  expect(f.repository.create).not.toHaveBeenCalled();
  await expect(
    f.service.create("owner", { requestId: crypto.randomUUID(), document }),
  ).rejects.toMatchObject({ code: "CONTEXT_PROJECT_MISMATCH" });
  f.repository.findCreation.mockRejectedValueOnce(new ContextError("IDEMPOTENCY_CONFLICT"));
  await expect(f.service.create("stranger", { requestId: id, document })).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  expect(f.repository.create).not.toHaveBeenCalled();
});

it("allows content edits and same-project restores after project removal but validates new ownership", async () => {
  const f = fixture();
  const document = {
    kind: f.document.kind,
    name: f.document.name,
    category: f.document.category,
    content: "Edited offline",
    project: { ...target },
  };
  f.validateProject.mockRejectedValue({ code: "DEVICE_REVOKED" });
  await f.service.update("owner", { id, revision: 2, document });
  await f.service.restore("owner", { id, revision: 2, version: 1 });
  expect(f.validateProject).not.toHaveBeenCalled();
  expect(f.repository.update).toHaveBeenCalledTimes(1);
  expect(f.repository.restore).toHaveBeenCalledTimes(1);
  await expect(
    f.service.update("owner", {
      id,
      revision: 2,
      document: { ...document, project: { ...target, projectId: crypto.randomUUID() } },
    }),
  ).rejects.toMatchObject({ code: "CONTEXT_PROJECT_MISMATCH" });
  f.version.project = { ...target, deviceId: crypto.randomUUID() };
  await expect(f.service.restore("owner", { id, revision: 2, version: 1 })).rejects.toMatchObject({
    code: "CONTEXT_PROJECT_MISMATCH",
  });
  await expect(f.service.update("owner", { id, revision: 1, document })).rejects.toMatchObject({
    code: "CONTEXT_CONFLICT",
  });
  await expect(f.service.restore("owner", { id, revision: 1, version: 1 })).rejects.toMatchObject({
    code: "CONTEXT_CONFLICT",
  });
  expect(f.repository.update).toHaveBeenCalledTimes(1);
  expect(f.repository.restore).toHaveBeenCalledTimes(1);
});

it("resolves explicitly selected historical revisions and snapshots them independently of later edits", async () => {
  const f = fixture("device");
  const snapshot = await f.service.resolve("device-owner", f.selection, target, "Task");
  expect(f.repository.readSources).toHaveBeenCalledWith("device-owner", f.selection.sources);
  expect(snapshot).toEqual({
    capturedAt: now,
    sources: [
      {
        id,
        revision: 1,
        kind: "memory",
        name: "Project rules",
        content: "Original instructions",
        project: target,
        scope: "device",
      },
    ],
  });
  f.version.content = "Later mutated storage object";
  f.document.name = "New name";
  expect(snapshot.sources[0]!.content).toBe("Original instructions");
  expect(snapshot.sources[0]!.name).toBe("Project rules");
});

it("rejects archived or moved current documents even when the requested revision was eligible", async () => {
  const f = fixture();
  f.document.archived = true;
  await expect(f.service.resolve("owner", f.selection, target, "Task")).rejects.toMatchObject({
    code: "CONTEXT_ARCHIVED",
  });
  f.document.archived = false;
  f.document.project = { ...target, projectId: crypto.randomUUID() };
  await expect(f.service.resolve("owner", f.selection, target, "Task")).rejects.toMatchObject({
    code: "CONTEXT_PROJECT_MISMATCH",
  });
  f.document.project = null;
  f.version.project = { ...target, deviceId: crypto.randomUUID() };
  await expect(f.service.resolve("owner", f.selection, target, "Task")).rejects.toMatchObject({
    code: "CONTEXT_PROJECT_MISMATCH",
  });
});

it("does not substitute latest or other owners' revisions and rejects duplicate references", async () => {
  const f = fixture();
  f.repository.readSources.mockResolvedValueOnce([]);
  await expect(f.service.resolve("stranger", f.selection, target, "Task")).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  f.version.revision = 2;
  await expect(f.service.resolve("owner", f.selection, target, "Task")).rejects.toMatchObject({
    code: "CONTEXT_NOT_FOUND",
  });
  await expect(
    f.service.resolve(
      "owner",
      { sources: [f.selection.sources[0]!, f.selection.sources[0]!] },
      target,
      "Task",
    ),
  ).rejects.toMatchObject({ code: "INVALID_CONTEXT" });
});

it("enforces the combined context budget without clipping a selected document", async () => {
  const f = fixture();
  const sources = Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), revision: 1 }));
  const resolved = sources.map((source) => ({
    current: { ...f.document, id: source.id },
    version: { ...f.version, id: source.id, content: "x".repeat(8000) },
  }));
  f.repository.readSources.mockResolvedValue(resolved);
  await expect(f.service.resolve("owner", { sources }, target, "Task")).rejects.toMatchObject({
    code: "CONTEXT_TOO_LARGE",
  });
  f.repository.readSources.mockResolvedValue(resolved.slice(0, 3));
  expect(
    (
      await f.service.resolve("owner", { sources: sources.slice(0, 3) }, target, "Task")
    ).sources.map((source) => source.content.length),
  ).toEqual([8000, 8000, 8000]);
  await expect(
    f.service.resolve("owner", { sources: sources.slice(0, 3) }, target, "x".repeat(9000)),
  ).rejects.toMatchObject({ code: "CONTEXT_TOO_LARGE" });
});

it("rejects noncanonical context IDs before lookup or project validation", async () => {
  const f = fixture();
  const selected = {
    sources: f.selection.sources.map((source) => ({
      ...source,
      id: "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF",
    })),
  };
  const upperTarget = {
    deviceId: "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF",
    projectId: target.projectId.toUpperCase(),
  };
  await expect(f.service.resolve("owner", selected, target, "Task")).rejects.toMatchObject({
    code: "INVALID_CONTEXT",
  });
  await expect(f.service.resolve("owner", f.selection, upperTarget, "Task")).rejects.toMatchObject({
    code: "INVALID_CONTEXT",
  });
  expect(f.repository.readSources).not.toHaveBeenCalled();
});

it("sanitizes persistence text and hides infrastructure errors without hiding domain errors", async () => {
  const f = fixture();
  await f.service.create("owner", {
    requestId: id,
    document: {
      kind: "template",
      name: "Unsafe\0",
      category: "",
      content: "Text\ud800",
      project: null,
    },
  });
  expect(f.repository.create).toHaveBeenCalledWith(
    "owner",
    id,
    expect.objectContaining({ name: "Unsafe�", content: "Text�" }),
  );
  f.repository.get.mockRejectedValueOnce(new Error("private database details"));
  await expect(f.service.get("owner", { id })).rejects.toMatchObject({
    code: "CONTEXT_UNAVAILABLE",
  });
  f.repository.get.mockRejectedValueOnce(new ContextError("CONTEXT_NOT_FOUND"));
  await expect(f.service.get("owner", { id })).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
});

it("validates permanent deletion and passes ownership/revision to the atomic repository", async () => {
  const f = fixture();
  expect(await f.service.delete("owner", { id, revision: 2 })).toEqual({ deleted: true });
  expect(f.repository.delete).toHaveBeenCalledWith("owner", id, 2);
  expect(() => f.service.delete("", { id, revision: 2 })).toThrow("AUTH_REQUIRED");
  expect(() => f.service.delete("owner", { id, revision: 0 })).toThrow("INVALID_CONTEXT");
});
