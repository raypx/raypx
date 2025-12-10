/**
 * AI Client
 * Unified interface for interacting with different AI providers
 */

import { AliyunProvider } from "./providers/aliyun";
import type { AIProvider } from "./providers/base";
import { DeepSeekProvider } from "./providers/deepseek";
import { OpenAIProvider } from "./providers/openai";
import type {
  ChatCompletionOptions,
  ChatCompletionResponse,
  LLMProvider,
  LLMProviderConfig,
  StreamCallback,
} from "./types";

/**
 * AI Client class
 * Provides a unified interface for interacting with different AI providers
 */
export class AIClient {
  private provider: AIProvider;

  constructor(config: LLMProviderConfig) {
    this.provider = this.createProvider(config);
  }

  /**
   * Create a provider instance based on configuration
   */
  private createProvider(config: LLMProviderConfig): AIProvider {
    switch (config.provider) {
      case "aliyun":
        return new AliyunProvider(config as LLMProviderConfig & { provider: "aliyun" });
      case "openai":
        return new OpenAIProvider(config as LLMProviderConfig & { provider: "openai" });
      case "deepseek":
        return new DeepSeekProvider(config as LLMProviderConfig & { provider: "deepseek" });
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  /**
   * Get the current provider name
   */
  getProvider(): LLMProvider {
    return this.provider.getProvider();
  }

  /**
   * Generate a chat completion (non-streaming)
   */
  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    return this.provider.chat(options);
  }

  /**
   * Generate a streaming chat completion
   */
  async chatStream(options: ChatCompletionOptions, callback: StreamCallback): Promise<void> {
    return this.provider.chatStream(options, callback);
  }

  /**
   * Update provider configuration
   */
  updateConfig(config: Partial<LLMProviderConfig>): void {
    const newConfig = { ...this.provider["config"], ...config } as LLMProviderConfig;
    this.provider = this.createProvider(newConfig);
  }
}
