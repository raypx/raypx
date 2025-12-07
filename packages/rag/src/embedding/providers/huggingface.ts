/**
 * Hugging Face Inference API embedding provider
 * Supports both hosted API and local models via transformers.js
 */

import type { EmbeddingProvider } from "./base";

export interface HuggingFaceProviderOptions {
  apiKey?: string;
  model?: string;
  apiUrl?: string; // For self-hosted models
}

export class HuggingFaceProvider implements EmbeddingProvider {
  private apiKey?: string;
  private model: string;
  private apiUrl?: string;
  private dimensions: number;

  constructor(options: HuggingFaceProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || "sentence-transformers/all-MiniLM-L6-v2";
    this.apiUrl = options.apiUrl;
    this.dimensions = 384; // Default for all-MiniLM-L6-v2, can be overridden
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0] || [];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const url =
      this.apiUrl ||
      `https://api-inference.huggingface.co/pipeline/feature-extraction/${this.model}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: texts,
        options: { wait_for_model: true },
      }),
    });

    if (!response.ok) {
      throw new Error(`Hugging Face API error: ${response.statusText}`);
    }

    const data = await response.json();
    // Handle both single and batch responses
    if (Array.isArray(data[0])) {
      return data;
    }
    return [data];
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}
