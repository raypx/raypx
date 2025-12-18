/**
 * DeepSeek Provider
 * Supports DeepSeek's API via OpenAI-compatible interface
 */

import type { LLMProviderConfig } from "../types";
import { LangChainAIProvider } from "./langchain-base";

export interface DeepSeekProviderConfig extends LLMProviderConfig {
  provider: "deepseek";
}

/**
 * DeepSeek AI Provider
 */
export class DeepSeekProvider extends LangChainAIProvider {
  constructor(config: DeepSeekProviderConfig) {
    super({
      ...config,
      provider: "deepseek",
    });
  }

  protected getBaseURL(): string | undefined {
    return this.config.apiUrl || "https://api.deepseek.com/v1";
  }

  protected getDefaultModel(): string {
    return "deepseek-chat";
  }
}
