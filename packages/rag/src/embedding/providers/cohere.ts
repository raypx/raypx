/**
 * Cohere embedding provider
 */

import type { EmbeddingProvider } from "./base";

export interface CohereProviderOptions {
  apiKey: string;
  model?: string;
}

export class CohereProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private dimensions: number;

  constructor(options: CohereProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || "embed-english-v3.0";
    this.dimensions = 1024; // Default for embed-english-v3.0
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0] || [];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.cohere.ai/v1/embed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        texts,
        model: this.model,
        input_type: "search_document",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Cohere API error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data.embeddings || [];
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}
