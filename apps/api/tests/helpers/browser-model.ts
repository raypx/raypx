import { createAssistantMessageEventStream, type AssistantMessage } from "@raypx/ai";
import type { ModelTurn } from "@raypx/agents/server";
import type { ConversationModels } from "../../src/conversations/models.js";
import { createConnectionTransport } from "../../src/conversations/connection-transport.js";

/** An explicit completion gate lets browsers inspect streamed text before commit. */
export function browserModelFixture() {
  const completions = new Set<() => void>();
  const resolve = async (completeImmediately = false) => ({
    stream(input: ModelTurn, signal: AbortSignal) {
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
      const lastMessage = [...input.history].reverse().find((entry) => entry.role === "user");
      const requestsFile = lastMessage?.text.startsWith("Fixture file write ") ?? false;
      if (requestsFile && !input.continuation?.length) {
        const request: AssistantMessage = {
          ...message(),
          content: [
            {
              type: "toolCall",
              id: "browser-write-file",
              name: "computer_write_file",
              arguments: {
                path: "browser-fixture.txt",
                content: "A deterministic browser approval fixture.\n",
              },
            },
          ],
          stopReason: "toolUse",
        };
        stream.push({ type: "done", reason: "toolUse", message: request });
        stream.end(request);
        return stream;
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
      // Background-triggered replies complete independently of the interactive
      // streaming gate, so parallel browser journeys cannot release each other.
      if (completeImmediately) queueMicrotask(complete);
      return stream;
    },
  });
  const models: ConversationModels = {
    list: async () => [
      { modelId: "browser-fixture", name: "Deterministic fixture", source: "deployment" },
    ],
    resolve: (run) => resolve(run.trigger !== "message"),
    close() {
      completions.clear();
    },
  };
  return {
    models,
    connectionTransport: {
      ...createConnectionTransport(),
      resolve: () => resolve(),
      test: async () => "SUCCEEDED" as const,
    },
    complete() {
      for (const complete of completions) complete();
    },
  };
}
