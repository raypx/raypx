import { generateText } from "ai";

import { AICache } from "../cache";
import { createAnthropic } from "../providers/anthropic";
import { createOpenAI } from "../providers/openai";
import type { AIProvider, GenerationOptions } from "../types";
import { AI_MODELS } from "../types";

export class GenerationService {
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

  async generate(
    prompt: string,
    type: string,
    options: GenerationOptions = {},
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
    const cacheKey = this.cache.generateGenerationCacheKey(
      modelConfig.provider,
      model,
      type,
      prompt,
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
    const result = await generateText({
      model: providerModel,
      prompt,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? modelConfig.maxTokens,
    });

    const response = {
      content: result.text,
      usage: {
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
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
}

export const generationService = new GenerationService(
  new AICache({} as any), // Will be initialized with proper cache
  process.env.OPENAI_API_KEY,
  process.env.ANTHROPIC_API_KEY,
);
