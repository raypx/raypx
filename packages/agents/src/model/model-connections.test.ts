import { expect, it, vi } from "vitest";
import { modelConnectionSchema } from "@raypx/core/model-connections";
import {
  ConnectionSecret,
  ModelConnectionsController,
  connectionConfiguration,
  createConnectionDraft,
  modelChoiceGroups,
  type ModelConnectionsPort,
} from "./model-connections.js";

const connection = modelConnectionSchema.parse({
  id: "d48dc15e-45ce-4d10-87bc-6ca6c45511a9",
  name: "Personal",
  kind: "openai",
  baseUrl: null,
  api: null,
  models: ["model-one"],
  availability: { mode: "all" },
  createdAt: "2026-11-14T00:00:00Z",
  updatedAt: "2026-11-14T00:00:00Z",
});
function fixture() {
  const port: ModelConnectionsPort = {
    list: vi.fn(async () => [connection]),
    create: vi.fn(async () => connection),
    update: vi.fn(async () => connection),
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({ code: "SUCCEEDED" as const })),
  };
  const controller = new ModelConnectionsController(port, { list: async () => [] });
  return { port, controller };
}
it("normalizes model identifiers and sends endpoint fields only for compatible providers", () => {
  const draft = {
    ...createConnectionDraft(connection),
    models: " model-one\nmodel-two ",
    baseUrl: "https://example.com",
    api: "openai-responses" as const,
  };
  expect(connectionConfiguration(draft)).toMatchObject({
    models: ["model-one", "model-two"],
    baseUrl: null,
    api: null,
  });
  expect(connectionConfiguration({ ...draft, kind: "compatible" })).toMatchObject({
    baseUrl: "https://example.com",
    api: "openai-responses",
  });
  expect(connectionConfiguration({ ...draft, models: "duplicate\nduplicate" })).toBeNull();
  expect(connectionConfiguration({ ...draft, kind: "compatible", baseUrl: "" })).toBeNull();
});
it("keeps availability explicit, including a deliberately empty Space selection", () => {
  expect(
    connectionConfiguration({
      ...createConnectionDraft(connection),
      availability: { mode: "selected", spaceIds: [] },
    })?.availability,
  ).toEqual({ mode: "selected", spaceIds: [] });
});
it("consumes and clears secrets without putting them into form draft state", () => {
  const secret = new ConnectionSecret();
  secret.set("private-key");
  expect(secret.take()).toBe("private-key");
  expect(secret.take()).toBe("");
  secret.set("another-key");
  secret.clear();
  expect(secret.take()).toBe("");
  expect(createConnectionDraft(connection)).not.toHaveProperty("secret");
});
it("omits an empty replacement key and exposes only sanitized connection state", async () => {
  const { port, controller } = fixture();
  await controller.load();
  await controller.save(
    connection.id,
    connectionConfiguration(createConnectionDraft(connection))!,
    "",
  );
  expect(port.update).toHaveBeenCalledWith({
    id: connection.id,
    connection: connectionConfiguration(createConnectionDraft(connection)),
  });
  await controller.save(
    null,
    connectionConfiguration(createConnectionDraft(connection))!,
    "write-only-key",
  );
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("write-only-key");
});
it.each([
  "SUCCEEDED",
  "AUTHENTICATION_FAILED",
  "RATE_LIMITED",
  "TIMED_OUT",
  "MODEL_UNAVAILABLE",
  "REQUEST_FAILED",
] as const)("retains the public test outcome %s", async (code) => {
  const { port, controller } = fixture();
  vi.mocked(port.test).mockResolvedValue({ code });
  await controller.test(connection.id);
  expect(controller.getSnapshot().testResults[connection.id]).toBe(code);
});
it("replaces provider diagnostics with the public failure outcome", async () => {
  const { port, controller } = fixture();
  vi.mocked(port.test).mockRejectedValue(new Error("private-key"));
  await controller.test(connection.id);
  expect(controller.getSnapshot().testResults[connection.id]).toBe("REQUEST_FAILED");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("private-key");
});
it("clears an earlier test outcome after saving a changed connection", async () => {
  const { controller } = fixture();
  await controller.load();
  await controller.test(connection.id);
  expect(controller.getSnapshot().testResults[connection.id]).toBe("SUCCEEDED");
  await controller.save(
    connection.id,
    connectionConfiguration({ ...createConnectionDraft(connection), models: "replacement-model" })!,
    "",
  );
  expect(controller.getSnapshot().testResults).not.toHaveProperty(connection.id);
});
it("removes only after a successful server deletion and preserves failures", async () => {
  const { port, controller } = fixture();
  await controller.load();
  vi.mocked(port.delete).mockRejectedValueOnce(new Error("failed"));
  await controller.remove(connection.id);
  expect(controller.getSnapshot().connections).toHaveLength(1);
  await controller.remove(connection.id);
  expect(controller.getSnapshot().connections).toEqual([]);
});
it("groups model choices without decoding member identifiers or changing their labels", () => {
  const member = {
    source: "connection" as const,
    modelId: "opaque-id",
    name: "Personal / model-one",
  };
  const deployment = { source: "deployment" as const, modelId: "server", name: "Server model" };
  expect(modelChoiceGroups([deployment, member])).toEqual({
    connection: [member],
    deployment: [deployment],
  });
});
