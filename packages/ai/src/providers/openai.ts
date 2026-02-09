import { createOpenAI as createCreateOpenAI } from "@ai-sdk/openai";

interface OpenAIClient {
  client: ReturnType<typeof createCreateOpenAI>;
  model: (modelId?: string) => ReturnType<ReturnType<typeof createCreateOpenAI>["chat"]>;
}

export function createOpenAI(apiKey?: string): OpenAIClient {
  const client = apiKey ? createCreateOpenAI({ apiKey }) : createCreateOpenAI();

  return {
    client,
    model: (modelId = "gpt-4o") => {
      return client.chat(modelId);
    },
  };
}
