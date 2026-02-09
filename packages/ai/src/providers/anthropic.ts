import { createAnthropic as createCreateAnthropic } from "@ai-sdk/anthropic";
import type { UIMessage } from "ai";

interface AnthropicClient {
  client: ReturnType<typeof createCreateAnthropic>;
  model: (modelId?: string) => ReturnType<ReturnType<typeof createCreateAnthropic>["chat"]>;
}

export function createAnthropic(apiKey?: string): AnthropicClient {
  const client = apiKey ? createCreateAnthropic({ apiKey }) : createCreateAnthropic();

  return {
    client,
    model: (modelId = "claude-3-5-sonnet-20241022") => {
      return client.chat(modelId);
    },
  };
}
