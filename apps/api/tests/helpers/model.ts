import { vi } from "vitest";
import { createAssistantMessageEventStream, type AssistantMessage } from "@raypx/ai";
import type { RunExecution } from "@raypx/agents/server";
import type { ConversationModels } from "../../src/conversations/models.js";

/** Explicit gates, no clocks or provider network. Also used by the PostgreSQL suite. */
export function modelFixture() {
  const calls: Array<{
    signal: AbortSignal;
    delta(text: string): void;
    reasoning(text: string): void;
    complete(finalText?: string): void;
    fail(): void;
  }> = [];
  const models: ConversationModels = {
    list: async () => [{ modelId: "fixture", name: "Deterministic fixture" }],
    resolve: vi.fn(async () => ({
      stream: (_input: Pick<RunExecution, "instructions" | "history">, signal: AbortSignal) => {
        const stream = createAssistantMessageEventStream();
        let text = "";
        function message(stopReason: "stop" | "error" | "aborted" = "stop"): AssistantMessage {
          return {
            role: "assistant",
            content: [{ type: "text", text }],
            api: "openai-responses",
            provider: "fixture",
            model: "fixture",
            stopReason,
            timestamp: 0,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          };
        }
        signal.addEventListener(
          "abort",
          () => {
            stream.push({ type: "error", reason: "aborted", error: message("aborted") });
            stream.end(message("aborted"));
          },
          { once: true },
        );
        calls.push({
          signal,
          reasoning(delta) {
            stream.push({ type: "thinking_delta", contentIndex: 1, delta, partial: message() });
          },
          delta(delta) {
            text += delta;
            stream.push({ type: "text_delta", contentIndex: 0, delta, partial: message() });
          },
          complete(finalText) {
            if (finalText !== undefined) text = finalText;
            stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message() });
            stream.push({ type: "done", reason: "stop", message: message() });
            stream.end(message());
          },
          fail() {
            stream.push({
              type: "error",
              reason: "error",
              error: {
                ...message("error"),
                errorMessage: "private-provider-message credential=secret-fixture",
              },
            });
            stream.end(message("error"));
          },
        });
        return stream;
      },
    })),
    close: vi.fn(),
  };
  return { models, calls };
}
