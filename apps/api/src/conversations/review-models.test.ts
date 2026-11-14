import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SpaceScope } from "@raypx/spaces/server";
import { spaceIdSchema } from "@raypx/core/spaces";
import { createDeploymentModels } from "./models.js";
import type { ConversationModels } from "./models.js";

const transport = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  complete: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@raypx/ai", async (original) => ({
  ...(await original<typeof import("@raypx/ai")>()),
  createAiClient: () => transport,
}));

const credential = "synthetic-review-credential-must-not-escape";
const entry = {
  modelId: "review-main",
  provider: "fixture-provider",
  model: "fixture-model",
  credentialId: "review-credential",
};
const spaceId = spaceIdSchema.parse("space");
const scope = {
  spaceId,
  member: { spaceId, accountId: "member", role: "owner", createdAt: new Date(0).toISOString() },
} as SpaceScope;
const active: ConversationModels[] = [];
function models(
  reviewModelId?: string,
  credentials = JSON.stringify({ "review-credential": credential }),
) {
  const value = createDeploymentModels(JSON.stringify([entry]), credentials, reviewModelId);
  active.push(value);
  return value;
}
beforeEach(() => {
  vi.resetAllMocks();
  transport.resolveModel.mockReturnValue({ id: entry.model });
  transport.complete.mockResolvedValue({
    content: [
      { type: "text", text: '{"verdict":"approve","reason":"Requested change","confidence":1}' },
    ],
  });
});
afterEach(() => {
  for (const value of active.splice(0)) value.close();
});

it("requires a selected offered model, explicit credential and locally resolvable catalog entry", async () => {
  expect(await models().reviewModel!.available()).toBe(false);
  expect(await models("not-offered").reviewModel!.available()).toBe(false);
  expect(await models(entry.modelId, "{}").reviewModel!.available()).toBe(false);
  const configured = models(entry.modelId);
  expect(await configured.reviewModel!.available()).toBe(true);
  expect(await configured.reviewModel!.resolve(scope)).toMatchObject({ modelId: entry.modelId });
  expect(transport.complete).not.toHaveBeenCalled();
  transport.resolveModel.mockImplementation(() => {
    throw new Error("Unknown catalog entry");
  });
  expect(await configured.reviewModel!.available()).toBe(false);
  expect(await configured.reviewModel!.resolve(scope)).toBeUndefined();
});

it("sends a separate tool-less request with explicit credentials and bounded output", async () => {
  const reviewer = await models(entry.modelId).reviewModel!.resolve(scope);
  const signal = new AbortController().signal;
  const result = await reviewer!.complete({
    systemPrompt: "Server-owned approval classification",
    input: '{"tool":"computer_write_file"}',
    maxOutputTokens: 256,
    signal,
  });
  expect(result).toContain('"verdict":"approve"');
  expect(transport.complete).toHaveBeenCalledExactlyOnceWith(
    { provider: entry.provider, model: entry.model },
    {
      systemPrompt: "Server-owned approval classification",
      messages: [{ role: "user", content: '{"tool":"computer_write_file"}', timestamp: 0 }],
      tools: [],
    },
    { signal, apiKey: credential, env: {}, maxTokens: 256, timeoutMs: 5_000 },
  );
});

it("rejects credential echoes and any tool output before returning reviewer text", async () => {
  const reviewer = await models(entry.modelId).reviewModel!.resolve(scope);
  const request = {
    systemPrompt: "Server-owned prompt",
    input: "Structured request",
    maxOutputTokens: 256,
    signal: new AbortController().signal,
  };
  await expect(reviewer!.complete({ ...request, input: credential })).rejects.toMatchObject({
    code: "AI_REQUEST_FAILED",
  });
  expect(transport.complete).not.toHaveBeenCalled();
  transport.complete.mockResolvedValueOnce({ content: [{ type: "text", text: credential }] });
  await expect(reviewer!.complete(request)).rejects.toMatchObject({ code: "AI_REQUEST_FAILED" });
  transport.complete.mockResolvedValueOnce({
    content: [{ type: "toolCall", name: "unsafe", arguments: {} }],
  });
  await expect(reviewer!.complete(request)).rejects.toMatchObject({ code: "AI_REQUEST_FAILED" });
});
