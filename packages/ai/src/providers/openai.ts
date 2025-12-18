/**
 * OpenAI Provider
 * Supports OpenAI's API directly
 */

import type { LLMProviderConfig } from "../types";
import { LangChainAIProvider } from "./langchain-base";

export interface OpenAIProviderConfig extends LLMProviderConfig {
  provider: "openai";
}

/**
 * OpenAI AI Provider
 */
export class OpenAIProvider extends LangChainAIProvider {
  constructor(config: OpenAIProviderConfig) {
    super({
      ...config,
      provider: "openai",
    });
  }

  protected getBaseURL(): string | undefined {
    // OpenAI uses default base URL if not provided
    return this.config.apiUrl;
  }

  protected getDefaultModel(): string {
    return "gpt-4";
  }
}
