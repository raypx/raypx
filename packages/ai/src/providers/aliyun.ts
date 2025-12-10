/**
 * Alibaba Cloud DashScope (通义千问) Provider
 * Supports Alibaba Cloud's DashScope API via OpenAI-compatible interface
 */

import type { LLMProviderConfig } from "../types";
import { LangChainAIProvider } from "./langchain-base";

export interface AliyunProviderConfig extends LLMProviderConfig {
  provider: "aliyun";
}

/**
 * Alibaba Cloud DashScope AI Provider
 */
export class AliyunProvider extends LangChainAIProvider {
  constructor(config: AliyunProviderConfig) {
    super({
      ...config,
      provider: "aliyun",
    });
  }

  protected getBaseURL(): string | undefined {
    return this.config.apiUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1";
  }

  protected getDefaultModel(): string {
    return "qwen3-max";
  }
}
