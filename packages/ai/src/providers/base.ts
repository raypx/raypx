/**
 * Base AI Provider Interface
 * All AI providers must implement this interface
 */

import type {
  ChatCompletionOptions,
  ChatCompletionResponse,
  LLMProviderConfig,
  StreamCallback,
} from "../types";

/**
 * Abstract base class for AI providers
 * Provides a common interface for all LLM providers
 */
export abstract class AIProvider {
  protected config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  /**
   * Get the provider name
   */
  getProvider(): LLMProviderConfig["provider"] {
    return this.config.provider;
  }

  /**
   * Generate a chat completion (non-streaming)
   * @param options - Chat completion options
   * @returns Chat completion response
   */
  abstract chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse>;

  /**
   * Generate a streaming chat completion
   * @param options - Chat completion options
   * @param callbacks - Callback functions for stream events
   * @returns Promise that resolves when streaming is complete
   */
  abstract chatStream(
    options: ChatCompletionOptions,
    callbacks: StreamCallback,
  ): Promise<void>;

  /**
   * Validate provider configuration
   * @throws Error if configuration is invalid
   */
  protected validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error(`API key is required for ${this.config.provider} provider`);
    }
    if (!this.config.model) {
      throw new Error(`Model is required for ${this.config.provider} provider`);
    }
  }
}
