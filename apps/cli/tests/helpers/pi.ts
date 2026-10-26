import {
  createAssistantMessageEventStream,
  Type,
  type AssistantMessage,
  type Model,
  type Api,
} from "@raypx/ai";
import type { AgentTool, StreamFn } from "@earendil-works/pi-agent-core";
import type { PiContext, PiContextStore } from "../../src/runtime/agents/harness/providers/pi";

export const piModel: Model<Api> = {
  id: "offline",
  name: "Offline fixture",
  api: "openai-completions",
  provider: "fixture",
  baseUrl: "https://fixture.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 4096,
  maxTokens: 512,
};
export function piMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: piModel.api,
    provider: piModel.provider,
    model: piModel.id,
    stopReason,
    timestamp: Date.now(),
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}
export function piStream(message: AssistantMessage, partial = "Partial draft") {
  if (message.stopReason === "pending") throw new Error("Fixture requires a final response");
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "start", partial: piMessage([{ type: "text", text: partial }]) });
  if (message.stopReason === "error" || message.stopReason === "aborted")
    stream.push({ type: "error", reason: message.stopReason, error: message });
  else stream.push({ type: "done", reason: message.stopReason, message });
  return stream;
}
export function piStore(initial?: Partial<PiContext>) {
  let value: PiContext = { revision: 0, status: "idle", messages: [], ...initial };
  const writes: PiContext[] = [];
  const store: PiContextStore = {
    async load() {
      return structuredClone(value);
    },
    async commit(expected, context) {
      if (expected !== value.revision) throw new Error("Conflict");
      value = { ...structuredClone(context), revision: expected + 1 };
      writes.push(structuredClone(value));
      return value.revision;
    },
  };
  return {
    store,
    writes,
    get value() {
      return structuredClone(value);
    },
  };
}
export function piTool(execute: AgentTool["execute"]): AgentTool {
  return {
    name: "fixture_tool",
    label: "Fixture tool",
    description: "Offline fixture only",
    parameters: Type.Object({ value: Type.String() }),
    execute,
  };
}
export function piScript(responses: AssistantMessage[]) {
  let calls = 0;
  const stream: StreamFn = (_model, _context, options) => {
    if (options?.maxRetries !== 0 || options.transport !== "sse")
      throw new Error("Unsafe request options");
    const message = responses[calls++];
    if (!message) throw new Error("Unexpected extra inference");
    return piStream(message);
  };
  return {
    stream,
    get calls() {
      return calls;
    },
  };
}
