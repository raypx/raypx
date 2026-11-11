import { expect, it } from "vite-plus/test";
import type { Api, Model, Message } from "@earendil-works/pi-ai";
import { prepareModelContext } from "./context.js";
const model: Model<Api> = {
  id: "target",
  name: "target",
  provider: "target",
  api: "anthropic-messages",
  baseUrl: "https://fixture.invalid",
  input: ["text"],
  reasoning: false,
  contextWindow: 4096,
  maxTokens: 512,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
it("keeps canonical history intact while removing foreign reasoning from a request", () => {
  const messages: Message[] = [
    {
      role: "assistant",
      api: "openai-responses",
      provider: "source",
      model: "source",
      content: [
        { type: "thinking", thinking: "private reasoning", thinkingSignature: "foreign-signature" },
        { type: "text", text: "Visible answer" },
      ],
      stopReason: "stop",
      timestamp: 0,
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    },
  ];
  const canonical = structuredClone(messages);
  const result = prepareModelContext(messages, model);
  expect(JSON.stringify(result)).not.toContain("foreign-signature");
  expect(JSON.stringify(result)).toContain("Visible answer");
  expect(messages).toEqual(canonical);
});
it("rejects unsupported images instead of silently dropping them", () => {
  expect(() =>
    prepareModelContext(
      [
        {
          role: "user",
          content: [{ type: "image", data: "AA==", mimeType: "image/png" }],
          timestamp: 0,
        },
      ],
      model,
    ),
  ).toThrow("AI_CONTEXT_INCOMPATIBLE");
});
it("rejects an over-budget context before a request without truncating history", () => {
  const messages: Message[] = [{ role: "user", content: "X".repeat(8000), timestamp: 0 }];
  expect(() =>
    prepareModelContext(messages, { ...model, contextWindow: 128, maxTokens: 64 }),
  ).toThrow("AI_CONTEXT_TOO_LARGE");
  expect(messages[0]?.content).toHaveLength(8000);
});
