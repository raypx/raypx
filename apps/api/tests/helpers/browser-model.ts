import { createAssistantMessageEventStream, type AssistantMessage, type ToolCall } from "@raypx/ai";
import type { ModelTurn } from "@raypx/agents/server";
import type { Run } from "@raypx/core/conversation";
import type { ConversationModels } from "../../src/conversations/models.js";
import { createConnectionTransport } from "../../src/conversations/connection-transport.js";

/** An explicit completion gate lets browsers inspect streamed text before commit. */
export function browserModelFixture() {
  const completions = new Map<() => void, { conversationId: string | undefined; group: boolean }>();
  const resolve = async (completeImmediately = false, run?: Run) => ({
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
      const requestsMcp = lastMessage?.text.startsWith("Fixture MCP call ") ?? false;
      const pagePrefix = "Fixture Page create ";
      const requestsPage = lastMessage?.text.startsWith(pagePrefix) ?? false;
      const requestsFile = lastMessage?.text.startsWith("Fixture file write ") ?? false;
      const groupCoordinator = input.instructions.includes("Fixture group coordinator.");
      const groupResponder = input.instructions.includes("Fixture group responder.");
      const child = Boolean(run?.parentRunId);
      const results = (input.continuation ?? []).filter((entry) => entry.role === "toolResult");
      function toolCall(name: string, id: string, args: ToolCall["arguments"], prefix = "") {
        const request: AssistantMessage = {
          ...message(),
          content: [
            ...(prefix ? [{ type: "text" as const, text: prefix }] : []),
            { type: "toolCall", id, name, arguments: args },
          ],
          stopReason: "toolUse",
        };
        if (prefix)
          stream.push({ type: "text_delta", contentIndex: 0, delta: prefix, partial: request });
        stream.push({ type: "done", reason: "toolUse", message: request });
        stream.end(request);
        return stream;
      }
      if (requestsPage && !results.some((entry) => entry.toolName === "agent_page_create"))
        return toolCall("agent_page_create", "browser-page-create", {
          title: lastMessage!.text.slice(pagePrefix.length),
          kind: "document",
          body: "# Agent Page\n\nCreated from the conversation.",
        });
      if (requestsMcp && !results.some((entry) => entry.toolName.startsWith("mcp_"))) {
        const remoteTool = input.tools?.find((candidate) =>
          candidate.name.endsWith("__fixture_echo"),
        );
        if (remoteTool)
          return toolCall(remoteTool.name, "browser-mcp-echo", { text: "Fixture MCP result" });
      }
      // These instruction markers are private to the owned browser fixture. The
      // actual backend still decides which explicit mentions start which Runs.
      if (groupCoordinator && !child) {
        const delegated = results.some((entry) => entry.toolName === "agent_delegate");
        const waited = results.some((entry) => entry.toolName === "agent_wait");
        if (!delegated)
          return toolCall(
            "agent_delegate",
            "browser-group-delegate",
            { task: "Write the delegated fixture file" },
            "Fixture coordinator is delegating.",
          );
        if (!waited) return toolCall("agent_wait", "browser-group-wait", {});
        text = "Fixture coordinator finished delegated work.";
      }
      if (groupResponder && !child) text = "Fixture independent reply";
      if (child && !results.some((entry) => entry.toolName === "computer_write_file"))
        return toolCall("computer_write_file", "browser-group-child-write", {
          path: "browser-group-fixture.txt",
          content: "A deterministic delegated browser fixture.\n",
        });
      if (child) text = "Fixture delegated task finished.";
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
        const suffix = groupCoordinator || child ? "" : " completed.";
        text += suffix;
        stream.push({
          type: "text_delta",
          contentIndex: 0,
          delta: suffix,
          partial: message(),
        });
        stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message() });
        stream.push({ type: "done", reason: "stop", message: message() });
        stream.end(message());
      }
      stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message() });
      signal.addEventListener("abort", abort, { once: true });
      completions.set(complete, {
        conversationId: run?.conversationId,
        group: groupCoordinator || groupResponder || child,
      });
      // Background-triggered replies complete independently of the interactive
      // streaming gate, so parallel browser journeys cannot release each other.
      if (completeImmediately || groupCoordinator || child || requestsMcp || requestsPage)
        queueMicrotask(complete);
      return stream;
    },
  });
  const models: ConversationModels = {
    list: async () => [
      { modelId: "browser-fixture", name: "Deterministic fixture", source: "deployment" },
    ],
    resolve: (run) => resolve(run.trigger !== "message", run),
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
    complete(conversationId?: string) {
      for (const [complete, entry] of completions) {
        // Existing direct-conversation gates do not release concurrent group
        // journeys, and each renderer's group gate addresses its own Conversation.
        if (conversationId ? entry.conversationId === conversationId : !entry.group) complete();
      }
    },
  };
}
