import type { Message } from "ai";

export type AIProvider = "openai" | "anthropic";

export type AIModel = {
  id: string;
  name: string;
  provider: AIProvider;
  maxTokens: number;
};

export type ChatMessage = Message;

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

export type ChatResponse = {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type GenerationOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

export type GenerationResponse = {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type AnalysisOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type AnalysisResult = {
  summary: string;
  insights: string[];
  charts?: ChartData[];
  metadata?: Record<string, unknown>;
};

export type ChartData = {
  type: "line" | "bar" | "pie";
  title: string;
  data: unknown[];
  config?: Record<string, unknown>;
};

export const AI_MODELS: Record<string, AIModel> = {
  "gpt-4o": {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    maxTokens: 128000,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    maxTokens: 128000,
  },
  "claude-3-5-sonnet-20241022": {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    maxTokens: 200000,
  },
  "claude-3-haiku-20240307": {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku",
    provider: "anthropic",
    maxTokens: 200000,
  },
};
