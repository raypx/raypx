import { expect, it } from "vite-plus/test";
import { localParams } from "../src/local.js";
import { taskCreateSchema, relayCommandSchema, relayClientSchema } from "../src/tasks.js";

it("accepts selected revisions on public task creation and snapshots only on the internal command", () => {
  const id = "11111111-1111-4111-8111-111111111111",
    sourceId = "22222222-2222-4222-8222-222222222222";
  const context = {
    capturedAt: new Date().toISOString(),
    sources: [
      {
        id: sourceId,
        revision: 2,
        kind: "template",
        name: "Template",
        content: "Pinned content",
        scope: "account",
        project: null,
      },
    ],
  };
  const input = {
    id,
    deviceId: id,
    projectId: id,
    provider: "codex",
    prompt: "Task",
    contextSelection: { sources: [{ id: sourceId, revision: 2 }] },
    context,
  };
  const parsed = taskCreateSchema.parse(input);
  expect(parsed.contextSelection).toEqual(input.contextSelection);
  expect(parsed).not.toHaveProperty("context");
  expect(
    relayCommandSchema.parse({
      id,
      deviceId: id,
      expiresAt: new Date().toISOString(),
      request: { method: "tasks.create", input },
      context,
    }).context,
  ).toEqual(context);
});
it("uses current context contracts without capability flags and forbids account routing on device memory", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(
    relayClientSchema.parse({
      type: "announce",
      streamId: id,
      instanceId: id,
      projects: [],
      capabilities: [],
    }),
  ).toEqual({ type: "announce", streamId: id, instanceId: id, projects: [], capabilities: [] });
  expect(localParams["memory.list"].safeParse({ accountId: "remote-account" }).success).toBe(false);
  expect(
    localParams["memory.resolve"].safeParse({
      selection: { sources: [] },
      target: { deviceId: id, projectId: id },
    }).success,
  ).toBe(true);
});
