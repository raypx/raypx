import { expect, it, vi } from "vitest";
import { AiError } from "@raypx/ai";
import type { ExecutionRun } from "@raypx/agents/server";
import { runSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { ModelConnectionConfiguration } from "@raypx/core/model-connections";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  createModelConnections,
  connectionModelId,
  ModelConnectionError,
  type ConnectionTransport,
  type ModelConnectionsRepository,
  type StoredModelConnection,
} from "./connections.js";
import type { ConversationModels } from "./models.js";
import type { SealedSecret, SecretStore } from "./secrets.js";

const credential = "member-connection-test-secret-should-never-escape";
const configuration: ModelConnectionConfiguration = {
  name: "Personal model",
  kind: "compatible",
  baseUrl: "https://models.example.test/v1",
  api: "openai-completions",
  models: ["model-a", "model-b"],
  availability: { mode: "all" },
};
const at = "2026-11-14T00:00:00.000Z";
function scope(accountId = "owner", selectedSpace = "space-a"): SpaceScope {
  const spaceId = spaceIdSchema.parse(selectedSpace);
  return {
    spaceId,
    member: { spaceId, accountId, role: "member", createdAt: at },
  } as SpaceScope;
}
function run(modelId: string, accountId = "owner", selectedSpace = "space-a"): ExecutionRun {
  return {
    ...runSchema.parse({
      id: "run",
      spaceId: selectedSpace,
      conversationId: "conversation",
      agentId: "agent",
      trigger: "message",
      messageId: "message",
      memberAccountId: accountId,
      model: { modelId },
      state: "running",
      failureCode: null,
      createdAt: at,
      startedAt: at,
      firstResponseAt: null,
      finishedAt: null,
    }),
    ownerId: "executor",
    fence: 1,
    attemptId: "attempt",
    attemptNumber: 1,
    timeoutAt: "2026-11-14T00:05:00.000Z",
    connectionId: null,
    computerId: null,
    computerGeneration: null,
  };
}
function fixture() {
  const members = new Map([
    ["owner", new Set(["space-a", "space-b"])],
    ["second", new Set(["space-a"])],
  ]);
  const rows = new Map<string, StoredModelConnection & { accountId: string }>();
  const storedSecrets = new Map<string, SealedSecret>();
  const values = new Map<string, string>();
  const transport: ConnectionTransport = {
    validate: vi.fn(),
    resolve: vi.fn(async () => ({
      stream: () => {
        throw new Error("Unused stream");
      },
    })),
    test: vi.fn(async () => "SUCCEEDED" as const),
    close: vi.fn(),
  };
  function owned(accountId: string, id: string) {
    const row = rows.get(id);
    if (!row || row.accountId !== accountId) throw new ModelConnectionError("NOT_FOUND");
    const { accountId: _accountId, ...stored } = row;
    return structuredClone(stored);
  }
  const repository: ModelConnectionsRepository = {
    async list(accountId, spaceId) {
      if (spaceId && !members.get(accountId)?.has(spaceId)) return [];
      return [...rows.values()]
        .filter(
          (row) =>
            row.accountId === accountId &&
            (spaceId === undefined ||
              row.availability.mode === "all" ||
              row.availability.spaceIds.some((id) => id === spaceId)),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((row) => owned(accountId, row.id));
    },
    async get(accountId, id) {
      return owned(accountId, id);
    },
    async create(accountId, id, secretId, input, sealed) {
      rows.set(id, {
        ...structuredClone(input),
        id,
        secretId,
        accountId,
        createdAt: at,
        updatedAt: at,
      });
      storedSecrets.set(secretId, sealed);
      return owned(accountId, id);
    },
    async update(accountId, id, input, sealed) {
      const current = owned(accountId, id);
      rows.set(id, { ...current, ...structuredClone(input), accountId });
      if (sealed) storedSecrets.set(current.secretId, sealed);
      return owned(accountId, id);
    },
    async delete(accountId, id) {
      const current = owned(accountId, id);
      rows.delete(id);
      storedSecrets.delete(current.secretId);
      return { deleted: true };
    },
  };
  const secrets: SecretStore = {
    seal: vi.fn(async (_accountId, _secretId, value) => {
      const ciphertext = `ciphertext-${values.size}`;
      values.set(ciphertext, value);
      return { keyId: "test-key", wrappedDataKey: "wrapped", ciphertext };
    }),
    read: vi.fn(async (accountId, connectionId, secretId) => {
      const current = owned(accountId, connectionId);
      if (current.secretId !== secretId) throw new Error("SECRET_UNAVAILABLE");
      const sealed = storedSecrets.get(secretId);
      if (!sealed) throw new Error("SECRET_UNAVAILABLE");
      return values.get(sealed.ciphertext)!;
    }),
  };
  const deployment: ConversationModels = {
    list: vi.fn(async () => [
      { modelId: "deployment-main", name: "Deployment", source: "deployment" as const },
    ]),
    resolve: vi.fn(async (execution) => {
      if (execution.model.modelId !== "deployment-main") throw new AiError("AI_MODEL_NOT_FOUND");
      return {
        stream: () => {
          throw new AiError("AI_MODEL_NOT_FOUND");
        },
      };
    }),
    close: vi.fn(),
  };
  const service = createModelConnections(repository, secrets, transport);
  return { service, repository, secrets, transport, deployment, members, rows, storedSecrets };
}

it("keeps connection CRUD owner-only and credentials write-only, replacing them only when supplied", async () => {
  const f = fixture();
  const created = await f.service.create("owner", configuration, credential);
  expect(created).toMatchObject(configuration);
  expect(created).not.toHaveProperty("secretId");
  expect(await f.service.list("second")).toEqual([]);
  await expect(
    f.service.update("second", created.id, configuration, "replacement"),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(f.service.delete("second", created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(f.service.test("second", created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.secrets.seal).toHaveBeenCalledTimes(1);
  const renamed = await f.service.update("owner", created.id, {
    ...configuration,
    name: "Renamed",
  });
  expect(f.secrets.seal).toHaveBeenCalledTimes(1);
  expect(await f.service.test("owner", created.id)).toEqual({ code: "SUCCEEDED" });
  expect(f.transport.test).toHaveBeenLastCalledWith(renamed, "model-a", credential);
  const rotated = await f.service.update(
    "owner",
    created.id,
    { ...configuration, name: "Rotated" },
    `${credential}-rotated`,
  );
  expect(f.secrets.seal).toHaveBeenCalledTimes(2);
  expect(await f.service.test("owner", created.id, "not-offered")).toEqual({
    code: "MODEL_UNAVAILABLE",
  });
  expect(f.transport.test).toHaveBeenCalledTimes(1);
  expect(await f.service.test("owner", created.id, "model-b")).toEqual({ code: "SUCCEEDED" });
  expect(f.transport.test).toHaveBeenLastCalledWith(rotated, "model-b", `${credential}-rotated`);
  const listed = await f.service.list("owner");
  const deleted = await f.service.delete("owner", created.id);
  expect(deleted).toEqual({ deleted: true });
  expect(f.storedSecrets.size).toBe(0);
  expect(await f.service.list("owner")).toEqual([]);
  await expect(f.service.update("owner", created.id, configuration)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  const serialized = JSON.stringify([created, renamed, rotated, listed, deleted]);
  expect(serialized).not.toContain(credential);
  expect(serialized).not.toContain("secretId");
  expect(serialized).not.toContain("ciphertext");
});

it("offers an owner's connections across their Spaces, respects narrowing, and isolates a second member", async () => {
  const f = fixture();
  const created = await f.service.create("owner", configuration, credential);
  const models = f.service.models(f.deployment);
  const modelId = connectionModelId(created.id, "model-a");
  const expected = { modelId, name: "Personal model / model-a", source: "connection" };
  expect(await models.list(scope())).toContainEqual(expected);
  expect(await models.list(scope("owner", "space-b"))).toContainEqual(expected);
  f.members.get("owner")!.add("later-space");
  expect(await models.list(scope("owner", "later-space"))).toContainEqual(expected);
  expect(await models.list(scope("second"))).toEqual([
    { modelId: "deployment-main", name: "Deployment", source: "deployment" as const },
  ]);
  await expect(models.resolve(run(modelId, "second"))).rejects.toMatchObject({
    code: "AI_MODEL_NOT_FOUND",
  });
  expect(f.secrets.read).not.toHaveBeenCalled();
  await f.service.update("owner", created.id, {
    ...configuration,
    availability: { mode: "selected", spaceIds: [spaceIdSchema.parse("space-b")] },
  });
  expect(await models.list(scope())).toEqual([
    { modelId: "deployment-main", name: "Deployment", source: "deployment" as const },
  ]);
  expect(await models.list(scope("owner", "space-b"))).toContainEqual(expected);
  await expect(models.resolve(run(modelId))).rejects.toMatchObject({ code: "AI_MODEL_NOT_FOUND" });
  const offered = await models.list(scope("owner", "space-b"));
  expect(offered.map((item) => item.modelId)).toEqual(
    offered.map((item) => item.modelId).sort((a, b) => a.localeCompare(b)),
  );
  expect(JSON.stringify(offered)).not.toContain(credential);
  expect(JSON.stringify(offered)).not.toContain(configuration.baseUrl!);
  expect(JSON.stringify(offered)).not.toContain("secretId");
});

it("keeps a pinned connection resumable after credential rotation and explicitly fails after deletion", async () => {
  const f = fixture();
  const created = await f.service.create("owner", configuration, credential);
  const models = f.service.models(f.deployment);
  const execution = run(connectionModelId(created.id, "model-a"));
  const first = await models.resolve(execution);
  expect(first.connectionId).toMatch(/^connection:[\w-]+:[a-f0-9]{64}$/);
  execution.connectionId = first.connectionId!;
  const checkpoint = { pendingCalls: [], continuation: [], connectionId: execution.connectionId };
  await f.service.update("owner", created.id, configuration, `${credential}-rotated`);
  expect((await models.resolve(execution)).connectionId).toBe(first.connectionId);
  expect(f.transport.resolve).toHaveBeenLastCalledWith(created, "model-a", `${credential}-rotated`);
  expect(JSON.stringify([execution, checkpoint, first])).not.toContain(credential);
  await f.service.delete("owner", created.id);
  await expect(models.resolve(execution)).rejects.toMatchObject({ code: "CONNECTION_UNAVAILABLE" });
  expect(f.deployment.resolve).not.toHaveBeenCalled();
});

it.each(["endpoint", "api", "model"] as const)(
  "refuses a resumed Run when its pinned %s is remapped",
  async (field) => {
    const f = fixture();
    const created = await f.service.create("owner", configuration, credential);
    const models = f.service.models(f.deployment);
    const execution = run(connectionModelId(created.id, "model-a"));
    execution.connectionId = (await models.resolve(execution)).connectionId!;
    const updated = { ...configuration };
    if (field === "endpoint") updated.baseUrl = "https://other.example.test/v1";
    if (field === "api") updated.api = "openai-responses";
    if (field === "model") updated.models = ["replacement-model"];
    await f.service.update("owner", created.id, updated);
    await expect(models.resolve(execution)).rejects.toMatchObject({
      code: "CONNECTION_UNAVAILABLE",
    });
    expect(f.transport.resolve).toHaveBeenCalledTimes(1);
  },
);

it("never falls back to deployment for a pinned member connection and sanitizes a failed test", async () => {
  const f = fixture();
  const created = await f.service.create("owner", configuration, credential);
  const models = f.service.models(f.deployment);
  const execution = run(connectionModelId(created.id, "model-a"));
  execution.connectionId = (await models.resolve(execution)).connectionId!;
  execution.model = { modelId: "deployment-main" };
  await expect(models.resolve(execution)).rejects.toMatchObject({ code: "CONNECTION_UNAVAILABLE" });
  expect(f.deployment.resolve).not.toHaveBeenCalled();
  vi.mocked(f.transport.test).mockRejectedValueOnce(
    new Error(`private provider error ${credential}`),
  );
  const outcome = await f.service.test("owner", created.id);
  expect(outcome).toEqual({ code: "REQUEST_FAILED" });
  expect(JSON.stringify(outcome)).not.toContain(credential);
  models.close();
  expect(f.transport.close).toHaveBeenCalledOnce();
  expect(f.deployment.close).toHaveBeenCalledOnce();
});

it("falls back to offered deployment identifiers even when they share the connection prefix", async () => {
  const f = fixture();
  const models = f.service.models(f.deployment);
  const modelId = "connection:deployment-selected";
  vi.mocked(f.deployment.list).mockResolvedValue([
    { modelId, name: "Deployment", source: "deployment" },
  ]);
  const resolved = {
    connectionId: "deployment-pin",
    stream: () => {
      throw new AiError("AI_CLOSED");
    },
  };
  vi.mocked(f.deployment.resolve).mockResolvedValue(resolved);
  expect(await models.resolve(run(modelId))).toBe(resolved);
  expect(await models.list(scope())).toEqual([
    { modelId, name: "Deployment", source: "deployment" },
  ]);
});

it("retains the deployment reviewer without borrowing a member connection or its secret", async () => {
  const f = fixture();
  const reviewModel = { available: () => true, resolve: vi.fn(async () => undefined) };
  f.deployment.reviewModel = reviewModel;
  await f.service.create("owner", configuration, credential);
  const models = f.service.models(f.deployment);
  expect(models.reviewModel).toBe(reviewModel);
  expect(await models.reviewModel!.available()).toBe(true);
  expect(await models.reviewModel!.resolve(scope())).toBeUndefined();
  expect(f.secrets.read).not.toHaveBeenCalled();
  expect(f.transport.resolve).not.toHaveBeenCalled();
});
