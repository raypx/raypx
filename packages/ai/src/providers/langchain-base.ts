/**
 * LangChain-based AI Provider Base Class
 * Provides common functionality for LangChain-based providers
 */

import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type {
  ChatCompletionOptions,
  ChatCompletionResponse,
  LLMProviderConfig,
  StreamCallback,
} from "../types";
import { AIProvider } from "./base";

/**
 * Base class for LangChain-based providers
 * Handles common LangChain ChatOpenAI setup and response processing
 */
export abstract class LangChainAIProvider extends AIProvider {
  /**
   * Get the base URL for the provider's API
   * Must be implemented by subclasses
   */
  protected abstract getBaseURL(): string | undefined;

  /**
   * Get the default model name if not specified
   * Must be implemented by subclasses
   */
  protected abstract getDefaultModel(): string;

  /**
   * Create a ChatOpenAI instance with provider-specific configuration
   */
  protected createChatModel(options: ChatCompletionOptions): ChatOpenAI {
    this.validateConfig();

    const baseURL = this.getBaseURL();
    const model = this.config.model || this.getDefaultModel();
    const temperature = options.temperature ?? this.config.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? this.config.maxTokens ?? 2000;

    return new ChatOpenAI({
      apiKey: this.config.apiKey,
      modelName: model,
      temperature,
      maxTokens,
      ...(baseURL && {
        configuration: {
          baseURL,
        },
      }),
    });
  }

  /**
   * Convert ChatMessage[] to BaseMessage[]
   */
  protected convertMessages(messages: ChatCompletionOptions["messages"]): BaseMessage[] {
    // If already BaseMessage[], return as is
    if (messages.length > 0 && messages[0] && "getType" in messages[0]) {
      return messages as BaseMessage[];
    }

    // Convert ChatMessage[] to BaseMessage[]
    return (messages as Array<{ role: string; content: string }>).map((msg) => {
      const content = msg.content || "";
      switch (msg.role) {
        case "user":
          return new HumanMessage(content);
        case "assistant":
          return new AIMessage(content);
        case "system":
          return new SystemMessage(content);
        default:
          return new HumanMessage(content);
      }
    });
  }

  /**
   * Extract thinking content from LangChain response
   */
  protected extractThinking(
    response: Awaited<ReturnType<ChatOpenAI["invoke"]>>,
  ): string | undefined {
    if (!response.additional_kwargs) {
      return undefined;
    }

    const rawResponse = response.additional_kwargs.raw_response as
      | {
          choices?: Array<{
            message?: {
              reasoning?: string;
              thinking?: string;
              content?: Array<{ type: string; text?: string; thinking?: string }>;
            };
          }>;
        }
      | undefined;

    if (rawResponse?.choices?.[0]?.message) {
      const message = rawResponse.choices[0].message;
      if (message.reasoning) {
        return message.reasoning;
      }
      if (message.thinking) {
        return message.thinking;
      }
      if (message.content) {
        const thinkingContent = message.content.find((c) => c.thinking);
        if (thinkingContent?.thinking) {
          return thinkingContent.thinking;
        }
      }
    }

    return undefined;
  }

  /**
   * Generate a chat completion (non-streaming)
   */
  async chat(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const chatModel = this.createChatModel(options);
    const messages = this.convertMessages(options.messages);

    const response = await chatModel.invoke(messages);

    const content = response.content;
    if (!content || typeof content !== "string") {
      throw new Error("No response from LLM or invalid response format");
    }

    const thinking = this.extractThinking(response);

    return {
      content,
      thinking,
      metadata: {
        model: this.config.model,
        provider: this.config.provider,
      },
    };
  }

  /**
   * Generate a streaming chat completion
   */
  async chatStream(options: ChatCompletionOptions, callback: StreamCallback): Promise<void> {
    const chatModel = this.createChatModel(options);
    const messages = this.convertMessages(options.messages);

    const stream = await chatModel.stream(messages);

    for await (const chunk of stream) {
      const content = chunk.content;
      if (content && typeof content === "string") {
        await callback({
          type: "chunk",
          content,
        });
      }

      // Extract thinking if available
      const thinking = this.extractThinking(chunk as Awaited<ReturnType<ChatOpenAI["invoke"]>>);
      if (thinking) {
        await callback({
          type: "thinking",
          content: thinking,
        });
      }
    }

    await callback({
      type: "done",
    });
  }
}
