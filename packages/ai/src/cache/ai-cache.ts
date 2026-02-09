import { createHash } from "node:crypto";

import type { Cache } from "@raypx/redis";

import type { ChatMessage, GenerationOptions } from "../types";

export type CachedResponse = {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timestamp: number;
};

export class AICache {
  private cache: Cache;
  private defaultTTL: number;

  constructor(cache: Cache, defaultTTL = 3600) {
    this.cache = cache;
    this.defaultTTL = defaultTTL;
  }

  async getCachedResponse(key: string): Promise<CachedResponse | null> {
    return (await this.cache.get(`ai:${key}`)) as CachedResponse | null;
  }

  async setCachedResponse(key: string, response: CachedResponse, ttl?: number): Promise<void> {
    await this.cache.put(`ai:${key}`, response, ttl ?? this.defaultTTL);
  }

  generateChatCacheKey(
    provider: string,
    model: string,
    messages: ChatMessage[],
    options: GenerationOptions,
  ): string {
    const messagesStr = JSON.stringify(messages);
    const optionsStr = JSON.stringify({
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
    const hash = createHash("sha256")
      .update(`${provider}:${model}:${messagesStr}:${optionsStr}`)
      .digest("hex");
    return `chat:${hash}`;
  }

  generateGenerationCacheKey(
    provider: string,
    model: string,
    type: string,
    prompt: string,
    options: GenerationOptions,
  ): string {
    const optionsStr = JSON.stringify({
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
    const hash = createHash("sha256")
      .update(`${provider}:${model}:${type}:${prompt}:${optionsStr}`)
      .digest("hex");
    return `gen:${hash}`;
  }

  generateAnalysisCacheKey(
    provider: string,
    model: string,
    dataType: string,
    data: string,
    analysisType: string,
  ): string {
    const hash = createHash("sha256")
      .update(`${provider}:${model}:${dataType}:${analysisType}:${data}`)
      .digest("hex");
    return `analysis:${hash}`;
  }
}
