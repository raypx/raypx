import { expect, it } from "vitest";
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
