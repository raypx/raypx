import { expect, it, vi } from "vite-plus/test";
import { createApiClient } from "@raypx/client";
import { ContextError, type ContextDocument, type ContextVersion } from "@raypx/memory";
import type { ContextLibraryService } from "@raypx/memory/server";
import { createApiApp } from "../../server/api.js";
import { controlAuth } from "../helpers/control.js";

function fixture() {
  const auth = controlAuth("memory-owner");
  let signedIn = true;
  const target = { deviceId: crypto.randomUUID(), projectId: crypto.randomUUID() };
  const document = {
    kind: "memory" as const,
    name: "Rules",
    category: "",
    content: "Run tests",
    project: target,
  };
  const now = new Date().toISOString();
  const saved: ContextDocument = {
    ...document,
    id: crypto.randomUUID(),
    revision: 1,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  const version: ContextVersion = { ...saved, reason: "created" };
  const { content: _content, ...summary } = saved;
  const snapshot = {
    capturedAt: now,
    sources: [
      {
        id: saved.id,
        revision: 1,
        kind: saved.kind,
        name: saved.name,
        content: saved.content,
        scope: "account" as const,
        project: target,
      },
    ],
  };
  const service = {
    list: vi.fn(async () => [summary]),
    delete: vi.fn(async () => ({ deleted: true as const })),
    get: vi.fn(async () => saved),
    create: vi.fn(async () => saved),
    update: vi.fn(async () => saved),
    archive: vi.fn(async () => saved),
    history: vi.fn(async () => [version]),
    restore: vi.fn(async () => saved),
    resolve: vi.fn(async () => snapshot),
  };
  const limit = vi.fn(async (_key: string, _rule: { window: number; max: number }) => true);
  const readSession = vi.fn(async () => (signedIn ? auth : null));
  const app = createApiApp({
    memory: service as unknown as ContextLibraryService,
    authHandler: async () => new Response(null, { status: 404 }),
    readSession,
    allowedOrigins: ["https://web.example.test", "views://main"],
    rateLimit: limit,
  });
  const client = (origin = "https://web.example.test") =>
    createApiClient({
      baseUrl: "https://api.example.test",
      headers: origin ? { origin } : {},
      fetch: async (url, init) => app.fetch(new Request(url, init)),
    }).memory;
  const selection = { sources: [{ id: saved.id, revision: 1 }] };
  return {
    auth,
    target,
    document,
    saved,
    snapshot,
    service,
    limit,
    readSession,
    selection,
    client,
    signOut: () => {
      signedIn = false;
    },
  };
}

it("authenticates each library RPC and derives the owner exclusively from the session", async () => {
  const f = fixture();
  await f.client().list({});
  await f.client().get({ id: f.saved.id });
  await f.client().create({ requestId: f.saved.id, document: f.document });
  await f.client().update({ id: f.saved.id, revision: 1, document: f.document });
  await f.client().archive({ id: f.saved.id, revision: 1, archived: true });
  await f.client().delete({ id: f.saved.id, revision: 1 });
  await f.client().history({ id: f.saved.id });
  await f.client().restore({ id: f.saved.id, revision: 1, version: 1 });
  await f.client().resolve({ selection: f.selection, target: f.target, prompt: "Inspect code" });
  expect(f.readSession).toHaveBeenCalledTimes(9);
  expect(f.service.delete).toHaveBeenCalledWith(f.auth.user.id, { id: f.saved.id, revision: 1 });
  expect(f.service.history).toHaveBeenCalledWith(f.auth.user.id, { id: f.saved.id, limit: 20 });
  expect(f.service.resolve).toHaveBeenCalledWith(
    f.auth.user.id,
    f.selection,
    f.target,
    "Inspect code",
  );
  f.signOut();
  await expect(f.client().list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    f.client().resolve({ selection: f.selection, target: f.target }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("requires an explicit trusted Origin for every mutation and permits the trusted Desktop Origin", async () => {
  const f = fixture();
  for (const origin of ["", "https://untrusted.example.test"]) {
    await expect(f.client(origin).delete({ id: f.saved.id, revision: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      f.client(origin).create({ requestId: f.saved.id, document: f.document }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.client(origin).update({ id: f.saved.id, revision: 1, document: f.document }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.client(origin).archive({ id: f.saved.id, revision: 1, archived: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.client(origin).restore({ id: f.saved.id, revision: 1, version: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  expect(f.service.create).not.toHaveBeenCalled();
  expect(f.service.delete).not.toHaveBeenCalled();
  expect(
    await f.client("views://main").create({ requestId: f.saved.id, document: f.document }),
  ).toEqual(f.saved);
});

it("rejects owner injection and rate limits reads, writes and snapshot resolution", async () => {
  const f = fixture();
  await expect(
    f.client().create({ requestId: f.saved.id, document: f.document, owner: "other" } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(f.service.create).not.toHaveBeenCalled();
  f.limit.mockResolvedValue(false);
  await expect(f.client().delete({ id: f.saved.id, revision: 1 })).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  await expect(f.client().list({})).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  await expect(
    f.client().create({ requestId: f.saved.id, document: f.document }),
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  await expect(
    f.client().resolve({ selection: f.selection, target: f.target }),
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  expect(f.limit.mock.calls.map(([key]) => key)).toContain(`rpc:${f.auth.user.id}:memory.resolve`);
});

it("maps stale revisions and infrastructure failures safely and checks the actual execution budget", async () => {
  const f = fixture();
  f.service.update.mockRejectedValueOnce(new ContextError("CONTEXT_CONFLICT"));
  await expect(
    f.client().update({ id: f.saved.id, revision: 1, document: f.document }),
  ).rejects.toMatchObject({ code: "CONFLICT", data: { error: { code: "CONTEXT_CONFLICT" } } });
  f.service.get.mockRejectedValueOnce(new ContextError("CONTEXT_UNAVAILABLE"));
  await expect(f.client().get({ id: f.saved.id })).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
  });
  f.service.resolve.mockRejectedValueOnce(new ContextError("CONTEXT_TOO_LARGE"));
  await expect(
    f.client().resolve({ selection: f.selection, target: f.target, prompt: "x".repeat(32_000) }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST", data: { error: { code: "CONTEXT_TOO_LARGE" } } });
  expect(f.service.resolve).toHaveBeenLastCalledWith(
    f.auth.user.id,
    f.selection,
    f.target,
    "x".repeat(32_000),
  );
});
