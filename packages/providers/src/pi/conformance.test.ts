import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
  type Api,
} from "@raypx/ai";
import { PiAdapter } from "./adapter.js";
import type { PiContext } from "./runner.js";
import { createTestProviderHost } from "../../tests/helpers/host.js";
import {
  defineProviderConformance,
  defineDrainConformance,
} from "../../tests/helpers/conformance.js";

function fixture() {
  const host = createTestProviderHost();
  const output = createAssistantMessageEventStream();
  let started = false;
  const model: Model<Api> = {
    id: "fixture",
    name: "fixture",
    provider: "fixture",
    api: "openai-completions",
    baseUrl: "https://fixture.invalid",
    reasoning: false,
    input: ["text"],
    contextWindow: 4096,
    maxTokens: 512,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  let context: PiContext = { revision: 0, status: "idle", messages: [] };
  const session = new PiAdapter(
    {
      sessionId: "pi:v1:fixture",
      model,
      stream: () => {
        started = true;
        return output;
      },
      tools: () => [],
      authorize: async () => "deny",
      close: () => {},
      store: {
        load: async () => structuredClone(context),
        commit: async (revision, value) => {
          if (revision !== context.revision) throw new Error("Conflict");
          context = { ...structuredClone(value), revision: revision + 1 };
          return context.revision;
        },
      },
    },
    host.ports,
  );
  const complete = () => {
    const message: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Complete" }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      stopReason: "stop",
      timestamp: Date.now(),
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: model.cost
          ? { ...model.cost, total: 0 }
          : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    output.push({ type: "done", reason: "stop", message });
  };
  return { session, host, complete, drain: complete, started: () => started };
}

defineProviderConformance("Pi", fixture);
defineDrainConformance("Pi", fixture);
