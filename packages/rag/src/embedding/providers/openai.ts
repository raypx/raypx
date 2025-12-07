/**
 * OpenAI embedding provider
 */

import OpenAI from "openai";
import type { EmbeddingProvider } from "./base";

export interface OpenAIProviderOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
}

export class OpenAIProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model || "text-embedding-3-small";
    this.dimensions = options.dimensions || 1024;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions,
    });

    return response.data[0]?.embedding || [];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });

    return response.data.map((item) => item.embedding);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}
