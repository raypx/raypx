import { expect, it } from "vitest";
import { createAiClient } from "@raypx/ai";
import { runSchema } from "@raypx/core/conversation";
import type { ExecutionRun } from "@raypx/agents/server";
import { createDeploymentModels } from "./models.js";
import type { SpaceScope } from "@raypx/spaces/server";
import { spaceIdSchema } from "@raypx/core/spaces";

const spaceId = spaceIdSchema.parse("space");
const scope = {
  spaceId,
  member: { spaceId, accountId: "member", role: "owner", createdAt: new Date().toISOString() },
} as SpaceScope;

it("projects configured identifiers and display names without provider or credential details", async () => {
  const models = createDeploymentModels(
    JSON.stringify([
      {
        modelId: "chat",
        name: "Friendly chat",
        provider: "private-vendor",
        model: "private-model",
        credentialId: "secret-id",
      },
      { modelId: "plain", provider: "vendor", model: "model", credentialId: "secret-id" },
      { modelId: "unavailable", provider: "vendor", model: "model", credentialId: "missing" },
    ]),
    JSON.stringify({ "secret-id": "private-credential" }),
  );
  try {
    await expect(models.list(scope)).resolves.toEqual([
      { modelId: "chat", name: "Friendly chat" },
      { modelId: "plain", name: "plain" },
    ]);
  } finally {
    models.close();
  }
});

it("represents no configured models as an empty offer and sanitizes invalid configuration", async () => {
  const models = createDeploymentModels("[]", "{}");
  try {
    await expect(models.list(scope)).resolves.toEqual([]);
  } finally {
    models.close();
  }
  expect(() => createDeploymentModels('[{"credentialId":"private-secret"}]', "{}")).toThrow(
    "Invalid deployment model configuration",
  );
});

it("pins the deployment connection selectors and rejects removal or remapping on resume", async () => {
  const client = createAiClient();
  const available = client.models("openai")[0]!;
  client.close();
  const entry = {
    modelId: "chat",
    provider: "openai",
    model: available.id,
    credentialId: "original",
  };
  const run: ExecutionRun = {
    ...runSchema.parse({
      id: "run",
      spaceId: "space",
      conversationId: "conversation",
      agentId: "agent",
      trigger: "message",
      messageId: "message",
      memberAccountId: "member",
      model: { modelId: "chat" },
      state: "running",
      failureCode: null,
      createdAt: new Date(0).toISOString(),
      startedAt: new Date(0).toISOString(),
      firstResponseAt: null,
      finishedAt: null,
    }),
    ownerId: "owner",
    fence: 1,
    attemptId: "attempt",
    attemptNumber: 1,
    timeoutAt: new Date(300_000).toISOString(),
    connectionId: null,
    computerId: null,
    computerGeneration: null,
  };
  const original = createDeploymentModels(JSON.stringify([entry]), '{"original":"private-value"}');
  const missing = createDeploymentModels(JSON.stringify([entry]), "{}");
  const remapped = createDeploymentModels(
    JSON.stringify([{ ...entry, credentialId: "new" }]),
    '{"new":"private-value"}',
  );
  const removed = createDeploymentModels("[]", "{}");
  try {
    const resolved = await original.resolve(run);
    expect(resolved.connectionId).toMatch(/^[a-f0-9]{64}$/);
    run.connectionId = resolved.connectionId!;
    await expect(original.resolve(run)).resolves.toHaveProperty("connectionId", run.connectionId);
    await expect(missing.resolve(run)).rejects.toMatchObject({ code: "CONNECTION_UNAVAILABLE" });
    await expect(remapped.resolve(run)).rejects.toMatchObject({ code: "CONNECTION_UNAVAILABLE" });
    await expect(removed.resolve(run)).rejects.toMatchObject({ code: "AI_MODEL_NOT_FOUND" });
  } finally {
    for (const models of [original, missing, remapped, removed]) models.close();
  }
});
