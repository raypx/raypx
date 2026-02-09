import { streamText } from "ai";

import { AICache } from "../cache";
import { createAnthropic } from "../providers/anthropic";
import { createOpenAI } from "../providers/openai";
import type { AIProvider, ChatMessage, ChatOptions } from "../types";
import { AI_MODELS } from "../types";

export class ChatService {
  private cache: AICache;
  private openaiApiKey?: string;
  private anthropicApiKey?: string;

  constructor(cache: AICache, openaiApiKey?: string, anthropicApiKey?: string) {
    this.cache = cache;
    this.openaiApiKey = openaiApiKey;
    this.anthropicApiKey = anthropicApiKey;
  }

  private getProviderModel(provider: AIProvider, model: string) {
    if (provider === "openai") {
      const providerClient = createOpenAI(this.openaiApiKey);
      return providerClient.model(model);
    }
    const providerClient = createAnthropic(this.anthropicApiKey);
    return providerClient.model(model);
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<{
    content: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const model = options.model ?? "gpt-4o";
    const modelConfig = AI_MODELS[model];

    if (!modelConfig) {
      throw new Error(`Unknown model: ${model}`);
    }

    // Check cache
    const cacheKey = this.cache.generateChatCacheKey(
      modelConfig.provider,
      model,
      messages,
      options,
    );

    if (!options.stream) {
      const cached = await this.cache.getCachedResponse(cacheKey);
      if (cached) {
        return {
          content: cached.content,
          usage: cached.usage,
        };
      }
    }

    // Get provider model
    const providerModel = this.getProviderModel(modelConfig.provider, model);

    // Call AI
    const result = await streamText({
      model: providerModel,
      messages: messages as unknown as { role: string; content: string }[],
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? modelConfig.maxTokens,
    });

    // Get full text
    const fullText = await result.text;
    const usage = result.usage;

    const response = {
      content: fullText,
      usage: {
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        totalTokens: usage?.totalTokens ?? 0,
      },
    };

    // Cache response
    if (!options.stream) {
      await this.cache.setCachedResponse(cacheKey, {
        ...response,
        timestamp: Date.now(),
      });
    }

    return response;
  }

  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string> {
    const model = options.model ?? "gpt-4o";
    const modelConfig = AI_MODELS[model];

    if (!modelConfig) {
      throw new Error(`Unknown model: ${model}`);
    }

    // Get provider model
    const providerModel = this.getProviderModel(modelConfig.provider, model);

    // Call AI
    const result = await streamText({
      model: providerModel,
      messages: messages as unknown as { role: string; content: string }[],
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? modelConfig.maxTokens,
    });

    // Stream chunks
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }
}

export const chatService = new ChatService(
  new AICache({} as any), // Will be initialized with proper cache
  process.env.OPENAI_API_KEY,
  process.env.ANTHROPIC_API_KEY,
);
