export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  sources?: Array<{
    chunkId: string;
    text: string;
    similarity: number;
    documentId?: string;
    documentName: string;
    chunkIndex?: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface ChatSource {
  chunkId: string;
  text: string;
  similarity: number;
  documentId?: string;
  documentName: string;
  chunkIndex?: number;
  metadata?: Record<string, unknown>;
}

export interface GroupedSource {
  documentName: string;
  documentId: string;
  chunks: Array<{
    chunkIndex: number;
    similarity: number;
  }>;
  maxSimilarity: number;
}

export type ChatContextType = "document" | "dataset";

export interface ChatStreamParams {
  messages: Array<{ role: string; content: string }>;
  documentId?: string;
  datasetId?: string;
  maxChunks?: number;
  similarityThreshold?: number;
  temperature?: number;
  maxTokens?: number;
  llmProvider?: string;
  llmModel?: string;
  conversationId?: string;
  saveHistory?: boolean;
}

export interface SSEEvent {
  event: string;
  data: unknown;
}
