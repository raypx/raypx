import { createAssistantMessageEventStream, type AssistantMessage } from "@raypx/ai";
import type { ConversationModels } from "../../src/conversations/models.js";

/** An explicit completion gate lets browsers inspect streamed text before commit. */
export function browserModelFixture() {
  const completions = new Set<() => void>();
  const models: ConversationModels = {
    list: async () => [{ modelId: "browser-fixture", name: "Deterministic fixture" }],
    resolve: async () => ({
      stream(_input, signal) {
        const stream = createAssistantMessageEventStream();
        let text = "Fixture reply";
        function message(stopReason: "stop" | "aborted" = "stop"): AssistantMessage {
          return {
            role: "assistant",
            content: [{ type: "text", text }],
            api: "openai-responses",
            provider: "fixture",
            model: "browser-fixture",
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
        function abort() {
          completions.delete(complete);
          stream.push({ type: "error", reason: "aborted", error: message("aborted") });
          stream.end(message("aborted"));
        }
        function complete() {
          completions.delete(complete);
          signal.removeEventListener("abort", abort);
          text += " completed.";
          stream.push({
            type: "text_delta",
            contentIndex: 0,
            delta: " completed.",
            partial: message(),
          });
          stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message() });
          stream.push({ type: "done", reason: "stop", message: message() });
          stream.end(message());
        }
        stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message() });
        signal.addEventListener("abort", abort, { once: true });
        completions.add(complete);
        return stream;
      },
    }),
    close() {
      completions.clear();
    },
  };
  return {
    models,
    complete() {
      for (const complete of completions) complete();
    },
  };
}
