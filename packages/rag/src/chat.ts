/**
 * Document-based chat using RAG
 * Combines vector search with LLM for conversational Q&A over documents
 */

import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AIClient, type LLMProvider } from "@raypx/ai";
import { getRAGConfig } from "./config";
import { saveMessage } from "./conversation";
import { type SearchResult, searchSimilarChunks } from "./search";
import { logger } from "./utils";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  documentId?: string;
  datasetId?: string;
  maxChunks?: number; // Maximum number of relevant chunks to include
  similarityThreshold?: number;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // LLM provider configuration (optional, will use RAG config if not provided)
  llmProvider?: "aliyun" | "openai" | "deepseek";
  llmApiKey?: string;
  llmApiUrl?: string;
  llmModel?: string; // e.g., "qwen-turbo", "qwen-plus", "gpt-4", etc.
  useAIQueryOptimization?: boolean; // Use AI to optimize query before search (default: true)
  // Memory configuration
  conversationId?: string; // Conversation ID for saving history
  memoryType?: "buffer" | "summary"; // Memory type (default: "buffer")
  saveHistory?: boolean; // Whether to save conversation history (default: true if conversationId provided)
  /**
   * Use MultiQueryRetriever to generate multiple query variants
   * This improves recall by searching with different query phrasings
   * Default: true
   */
  useMultiQuery?: boolean;
  /**
   * Use ContextualCompressionRetriever to compress retrieved documents
   * This reduces token usage by keeping only the most relevant parts
   * Default: true
   */
  useCompression?: boolean;
}

export interface ChatResponse {
  answer: string;
  sources: SearchResult[];
  thinking?: string; // Thinking/reasoning content from models like o1, o3
  metadata?: {
    chunksUsed: number;
    averageSimilarity: number;
  };
}

/**
 * Generate a chat response based on document context
 * This is a basic implementation - you'll need to integrate with an LLM provider
 * (e.g., OpenAI, Anthropic, etc.) for the actual response generation
 *
 * @param messages - Chat history
 * @param userId - User ID
 * @param options - Chat options
 * @returns Chat response with answer and sources
 */
export async function chatWithDocument(
  messages: ChatMessage[],
  userId: string,
  options: ChatOptions = {},
): Promise<ChatResponse> {
  const {
    documentId,
    datasetId,
    maxChunks = 5,
    similarityThreshold = 0.1, // Lower threshold for better recall
    systemPrompt,
    useAIQueryOptimization = true, // Use AI to optimize query by default
    conversationId,
    saveHistory = !!conversationId, // Auto-save if conversationId is provided
  } = options;

  logger.debug("Starting document chat", {
    messagesCount: messages.length,
    documentId,
    datasetId,
    maxChunks,
    useAIQueryOptimization,
  });

  // Get the last user message
  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  if (!lastUserMessage) {
    throw new Error("No user message found in chat history");
  }

  const rawQuery = lastUserMessage.content;

  // Preprocess query to improve search quality
  // Use AI optimization if enabled, otherwise use rule-based preprocessing
  let query: string;
  if (useAIQueryOptimization) {
    try {
      // Get RAG config for LLM settings
      const ragConfig = await getRAGConfig(userId);
      query = await optimizeQueryWithAI(rawQuery, userId, {
        ...options,
        ragConfig,
      });
      logger.debug("Query optimized with AI", {
        original: rawQuery,
        optimized: query,
      });
    } catch (error) {
      // Fallback to rule-based preprocessing if AI optimization fails
      logger.warn("AI query optimization failed, falling back to rule-based preprocessing", {
        error: error instanceof Error ? error.message : String(error),
      });
      query = preprocessQuery(rawQuery);
      logger.debug("Query preprocessing (fallback)", {
        original: rawQuery,
        processed: query,
      });
    }
  } else {
    query = preprocessQuery(rawQuery);
    logger.debug("Query preprocessing", {
      original: rawQuery,
      processed: query,
    });
  }

  // Search for relevant chunks
  // Use minResults to ensure we get at least some results even if similarity is low
  const relevantChunks = await searchSimilarChunks(query, userId, {
    limit: maxChunks,
    threshold: similarityThreshold,
    minResults: 1, // Always return at least 1 result if available
    documentId,
    datasetId,
    includeMetadata: true,
  });

  if (relevantChunks.length === 0) {
    logger.warn("No relevant chunks found", {
      query,
      documentId,
      datasetId,
    });
    return {
      answer:
        "I couldn't find relevant information in the document to answer your question. Please try rephrasing your question or check if the document contains the information you're looking for.",
      sources: [],
      metadata: {
        chunksUsed: 0,
        averageSimilarity: 0,
      },
    };
  }

  logger.debug("Found relevant chunks", {
    count: relevantChunks.length,
    averageSimilarity:
      relevantChunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / relevantChunks.length,
  });

  // Build context from relevant chunks
  const context = relevantChunks
    .map((chunk, index) => `[Chunk ${index + 1} from "${chunk.documentName}"]:\n${chunk.text}`)
    .join("\n\n");

  // Build messages for LLM (using proper message format)
  const llmMessages = buildLLMMessages(messages, context, systemPrompt);

  // Get RAG config for LLM settings
  const ragConfig = await getRAGConfig(userId);
  logger.debug("RAG config", { ragConfig });
  logger.debug("LLM messages", { llmMessages });
  // Generate LLM response
  const llmResponse = await generateLLMResponse(llmMessages, userId, {
    ...options,
    ragConfig,
  }).catch((error: unknown) => {
    logger.error("Failed to generate LLM response", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    // Fallback: return a simple answer based on the most relevant chunk
    return {
      answer: `Based on the document, here's what I found:\n\n${relevantChunks[0]?.text || "No relevant information found."}`,
      thinking: undefined,
    };
  });

  const averageSimilarity =
    relevantChunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / relevantChunks.length;

  const response: ChatResponse = {
    answer: llmResponse.answer,
    thinking: llmResponse.thinking,
    sources: relevantChunks,
    metadata: {
      chunksUsed: relevantChunks.length,
      averageSimilarity,
    },
  };

  // Save conversation history if enabled
  if (saveHistory && conversationId) {
    try {
      // Save user message
      const lastUserMessage = messages.filter((m) => m.role === "user").pop();
      if (lastUserMessage) {
        await saveMessage(conversationId, {
          role: "user",
          content: lastUserMessage.content,
        });
      }

      // Save assistant response
      await saveMessage(conversationId, {
        role: "assistant",
        content: response.answer,
        thinking: response.thinking,
        sources: response.sources,
      });

      logger.debug("Saved conversation history", { conversationId });
    } catch (error) {
      // Log error but don't fail the request
      logger.warn("Failed to save conversation history", {
        error: error instanceof Error ? error.message : String(error),
        conversationId,
      });
    }
  }

  return response;
}

/**
 * Optimize query using AI/LLM to improve search quality
 * Extracts key information, removes conversational noise, and expands query for better matching
 */
async function optimizeQueryWithAI(
  query: string,
  userId: string,
  options: ChatOptions & { ragConfig?: Awaited<ReturnType<typeof getRAGConfig>> },
): Promise<string> {
  if (!query || query.trim().length === 0) {
    return query;
  }

  const ragConfig = options.ragConfig || (await getRAGConfig(userId));

  // Build optimization prompt
  const optimizationPrompt = `You are a query optimization assistant. Your task is to rewrite the user's question into a better search query for document retrieval.

Rules:
1. Extract the core information need from the question
2. Remove conversational noise (like "请", "帮我", "can you", "tell me", etc.)
3. Keep important keywords and concepts
4. For generic questions asking about document content (like "what's in the document", "文档中写了什么", "文档内容", "文档讲了什么"), expand them to include common document-related keywords that would help match document text (e.g., "主要内容", "核心观点", "关键信息", "章节", "摘要", "内容概述" for Chinese; "main content", "key points", "summary", "overview", "topics" for English)
5. For specific questions, extract the key concepts and remove question words
6. Return ONLY the optimized query, no explanations or additional text
7. Keep the same language as the input
8. The output should be concise and suitable for semantic search

User question: ${query}

Optimized query:`;

  try {
    // Use a lightweight, fast model for query optimization
    const optimizedQuery = await generateLLMResponse(
      [new HumanMessage(optimizationPrompt)],
      userId,
      {
        ...options,
        ragConfig,
        temperature: 0.3, // Lower temperature for more consistent results
        maxTokens: 100, // Short response for query optimization
        llmModel: options.llmModel || ragConfig?.model || undefined, // Use configured model or default
      },
    ).then((response) => response.answer.trim());

    // Validate optimized query
    if (!optimizedQuery || optimizedQuery.length < 2) {
      logger.warn("AI optimization returned invalid query, using original");
      return preprocessQuery(query);
    }

    return optimizedQuery;
  } catch (error) {
    logger.error("Failed to optimize query with AI", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback to rule-based preprocessing
    throw error;
  }
}

/**
 * Preprocess query to improve search quality (rule-based fallback)
 * Only performs basic cleanup - all intelligent processing is done by AI optimization
 * This function is used as a fallback when AI optimization is disabled or fails
 */
function preprocessQuery(query: string): string {
  if (!query || query.trim().length === 0) {
    return query;
  }

  // Only do basic cleanup: normalize whitespace and remove trailing punctuation
  // All intelligent query optimization (prefix removal, query expansion, etc.)
  // is handled by AI optimization (optimizeQueryWithAI)
  let processed = query.trim();

  // Normalize whitespace
  processed = processed.replace(/\s+/g, " ").trim();

  // Remove trailing punctuation (keep the content)
  processed = processed.replace(/[？?！!。，,]+$/g, "").trim();

  // If preprocessing removed everything, return original query
  if (processed.length === 0) {
    return query;
  }

  return processed;
}

/**
 * Detect if text contains Chinese characters
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

/**
 * Detect primary language from messages
 * Returns 'zh' for Chinese, 'en' for English, or 'auto' if mixed
 */
function detectLanguage(messages: ChatMessage[]): string {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) {
    return "auto";
  }

  // Check the last user message (most recent)
  const lastUserMessage = userMessages[userMessages.length - 1];
  if (!lastUserMessage) {
    return "auto";
  }

  const hasChinese = containsChinese(lastUserMessage.content);
  const hasEnglish = /[a-zA-Z]/.test(lastUserMessage.content);

  // If contains Chinese characters, prioritize Chinese
  if (hasChinese) {
    return "zh";
  }

  // If only English, use English
  if (hasEnglish && !hasChinese) {
    return "en";
  }

  // Default to auto (let LLM decide)
  return "auto";
}

/**
 * Build LangChain messages with context
 */
function buildLLMMessages(
  messages: ChatMessage[],
  context: string,
  systemPrompt?: string,
): BaseMessage[] {
  // Detect language from user messages
  const detectedLanguage = detectLanguage(messages);

  // Build language-specific instruction
  let languageInstruction = "";
  if (detectedLanguage === "zh") {
    languageInstruction = "\n\n重要：请使用中文回复。如果用户使用中文提问，你必须用中文回答。";
  } else if (detectedLanguage === "en") {
    languageInstruction =
      "\n\nImportant: Please respond in English. If the user asks in English, you must respond in English.";
  } else {
    languageInstruction =
      "\n\nImportant: Please respond in the same language as the user's question. Match the language of your response to the language of the user's input.";
  }

  const defaultSystemPrompt = `You are a helpful assistant that answers questions based on the provided document context. 
Use only the information from the context to answer questions. If the context doesn't contain enough information to answer the question, say so.
Be concise and accurate in your responses.${languageInstruction}`;

  const system = systemPrompt || defaultSystemPrompt;

  const contextSection = `\n\n## Document Context:\n${context}\n`;

  // Build messages array using LangChain message types
  const llmMessages: BaseMessage[] = [new SystemMessage(`${system}${contextSection}`)];

  // Add conversation history
  for (const msg of messages) {
    if (msg.role === "user") {
      llmMessages.push(new HumanMessage(msg.content));
    } else if (msg.role === "assistant") {
      llmMessages.push(new AIMessage(msg.content));
    }
    // System messages are already handled above
  }

  return llmMessages;
}

/**
 * Generate LLM response using @raypx/ai framework
 * Supports Alibaba Cloud DashScope (通义千问), OpenAI, DeepSeek and other OpenAI-compatible APIs
 */
async function generateLLMResponse(
  messages: BaseMessage[],
  _userId: string,
  options: ChatOptions & { ragConfig?: Awaited<ReturnType<typeof getRAGConfig>> },
): Promise<{ answer: string; thinking?: string }> {
  const {
    llmProvider = "aliyun", // Default to Alibaba Cloud
    llmApiKey,
    llmApiUrl,
    llmModel,
    temperature = 0.7,
    maxTokens = 2000,
    ragConfig,
  } = options;

  logger.debug("Generating LLM response", {
    provider: llmProvider,
    model: llmModel,
    messagesCount: messages.length,
  });

  // Determine API key and URL
  const apiKey = llmApiKey || ragConfig?.apiKey;
  if (!apiKey) {
    throw new Error("LLM API key is required. Please configure it in RAG settings.");
  }

  // Determine API URL and model based on provider
  let apiUrl: string | undefined;
  let defaultModel: string;

  switch (llmProvider) {
    case "aliyun":
      // Alibaba Cloud DashScope (通义千问)
      apiUrl =
        llmApiUrl || ragConfig?.apiUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1";
      defaultModel = llmModel || "qwen3-max"; // Default to qwen3-max for chat
      break;
    case "openai":
      apiUrl = llmApiUrl; // OpenAI default if not provided
      defaultModel = llmModel || "gpt-4";
      break;
    case "deepseek":
      apiUrl = llmApiUrl || "https://api.deepseek.com/v1";
      defaultModel = llmModel || "deepseek-chat";
      break;
    default:
      throw new Error(`Unsupported LLM provider: ${llmProvider}`);
  }

  try {
    // Create AI client using @raypx/ai framework
    const aiClient = new AIClient({
      provider: llmProvider as LLMProvider,
      apiKey,
      apiUrl,
      model: defaultModel,
      temperature,
      maxTokens,
    });

    logger.debug("Calling LLM API via @raypx/ai", {
      provider: llmProvider,
      apiUrl,
      model: defaultModel,
      temperature,
      maxTokens,
    });

    // Convert BaseMessage[] to ChatMessage[]
    const chatMessages = messages.map((msg) => {
      if (msg instanceof HumanMessage) {
        return { role: "user" as const, content: msg.content as string };
      }
      if (msg instanceof AIMessage) {
        return { role: "assistant" as const, content: msg.content as string };
      }
      if (msg instanceof SystemMessage) {
        return { role: "system" as const, content: msg.content as string };
      }
      return { role: "user" as const, content: String(msg.content) };
    });

    // Invoke the chat model
    const response = await aiClient.chat({
      messages: chatMessages,
      temperature,
      maxTokens,
    });

    logger.debug("LLM response generated", {
      answerLength: response.content.length,
      hasThinking: !!response.thinking,
      thinkingLength: response.thinking?.length,
    });

    return { answer: response.content, thinking: response.thinking };
  } catch (error) {
    logger.error("Failed to generate LLM response", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
      provider: llmProvider,
      apiUrl,
      model: defaultModel,
    });
    throw error;
  }
}

/**
 * Streaming chat with documents
 * Uses LangChain's streaming API to send chunks as they're generated
 */
export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onThinking?: (thinking: string) => void;
  onSources?: (sources: SearchResult[]) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export async function chatWithDocumentStream(
  messages: ChatMessage[],
  userId: string,
  options: ChatOptions = {},
  callbacks: StreamCallbacks,
): Promise<void> {
  const {
    documentId,
    datasetId,
    maxChunks = 5,
    similarityThreshold = 0.1,
    systemPrompt,
    useAIQueryOptimization = true,
    conversationId,
    saveHistory = !!conversationId,
  } = options;

  let fullAnswer = "";
  let fullThinking: string | undefined;
  let savedSources: SearchResult[] | undefined;

  try {
    logger.debug("Starting streaming document chat", {
      messagesCount: messages.length,
      documentId,
      datasetId,
      maxChunks,
    });

    // Get the last user message
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) {
      throw new Error("No user message found in chat history");
    }

    const rawQuery = lastUserMessage.content;

    // Preprocess query
    let query: string;
    if (useAIQueryOptimization) {
      try {
        const ragConfig = await getRAGConfig(userId);
        query = await optimizeQueryWithAI(rawQuery, userId, {
          ...options,
          ragConfig,
        });
      } catch (error) {
        logger.warn("AI query optimization failed, falling back to rule-based preprocessing", {
          error: error instanceof Error ? error.message : String(error),
        });
        query = preprocessQuery(rawQuery);
      }
    } else {
      query = preprocessQuery(rawQuery);
    }

    // Get RAG config for LLM (needed for advanced retrievers)
    const ragConfig = await getRAGConfig(userId);

    // Create LLM instance for advanced retrievers if needed
    let llmForRetrieval: unknown | undefined;
    if (options.useMultiQuery || options.useCompression) {
      try {
        const apiKey = options.llmApiKey || ragConfig.apiKey;
        if (apiKey) {
          const llmProvider = options.llmProvider || "aliyun";
          let baseURL: string | undefined;
          let defaultModel: string;

          switch (llmProvider) {
            case "aliyun":
              baseURL =
                options.llmApiUrl ||
                ragConfig.apiUrl ||
                "https://dashscope.aliyuncs.com/compatible-mode/v1";
              defaultModel = options.llmModel || "qwen3-max";
              break;
            case "openai":
              baseURL = options.llmApiUrl;
              defaultModel = options.llmModel || "gpt-4";
              break;
            case "deepseek":
              baseURL = options.llmApiUrl || "https://api.deepseek.com/v1";
              defaultModel = options.llmModel || "deepseek-chat";
              break;
            default:
              throw new Error(`Unsupported LLM provider: ${llmProvider}`);
          }

          llmForRetrieval = new ChatOpenAI({
            apiKey,
            modelName: defaultModel,
            temperature: 0, // Use low temperature for retrieval tasks
            ...(baseURL && {
              configuration: {
                baseURL,
              },
            }),
          });
        }
      } catch (error) {
        logger.warn("Failed to create LLM for advanced retrievers", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Search for relevant chunks
    const relevantChunks = await searchSimilarChunks(query, userId, {
      limit: maxChunks,
      threshold: similarityThreshold,
      minResults: 1,
      documentId,
      datasetId,
      includeMetadata: true,
      useMultiQuery: options.useMultiQuery,
      useCompression: options.useCompression,
      llm: llmForRetrieval,
    });

    // Send sources via callback
    if (callbacks.onSources && relevantChunks.length > 0) {
      savedSources = relevantChunks;
      callbacks.onSources(relevantChunks);
    }

    if (relevantChunks.length === 0) {
      logger.warn("No relevant chunks found", { query, documentId, datasetId });
      // Send empty sources first
      if (callbacks.onSources) {
        callbacks.onSources([]);
      }
      // Send error message as chunk
      callbacks.onChunk(
        "I couldn't find relevant information in the document to answer your question. Please try rephrasing your question or check if the document contains the information you're looking for.",
      );
      callbacks.onComplete();
      return;
    }

    // Build context from relevant chunks
    const context = relevantChunks
      .map((chunk, index) => `[Chunk ${index + 1} from "${chunk.documentName}"]:\n${chunk.text}`)
      .join("\n\n");

    // Build messages for LLM
    const llmMessages = buildLLMMessages(messages, context, systemPrompt);

    // Get RAG config for LLM settings (ragConfig was already retrieved above for advanced retrievers)
    const finalRagConfig = ragConfig || (await getRAGConfig(userId));

    // Generate streaming LLM response
    await generateLLMResponseStream(
      llmMessages,
      userId,
      {
        ...options,
        ragConfig: finalRagConfig,
      },
      {
        ...callbacks,
        onChunk: (chunk: string) => {
          fullAnswer += chunk;
          callbacks.onChunk(chunk);
        },
        onThinking: (thinking: string) => {
          fullThinking = (fullThinking || "") + thinking;
          callbacks.onThinking?.(thinking);
        },
      },
    );

    // Save conversation history if enabled
    if (saveHistory && conversationId) {
      try {
        // Save user message
        const lastUserMessage = messages.filter((m) => m.role === "user").pop();
        if (lastUserMessage) {
          await saveMessage(conversationId, {
            role: "user",
            content: lastUserMessage.content,
          });
        }

        // Save assistant response
        await saveMessage(conversationId, {
          role: "assistant",
          content: fullAnswer,
          thinking: fullThinking,
          sources: savedSources,
        });

        logger.debug("Saved streaming conversation history", { conversationId });
      } catch (error) {
        // Log error but don't fail the request
        logger.warn("Failed to save streaming conversation history", {
          error: error instanceof Error ? error.message : String(error),
          conversationId,
        });
      }
    }

    callbacks.onComplete();
  } catch (error) {
    // Clean error message by removing SQL query details and vector arrays
    const cleanErrorMessage = (errorMessage: string): string => {
      let cleaned = errorMessage;

      // Remove "Failed query:" and everything after it (SQL queries)
      const failedQueryMatch = cleaned.match(/Failed query:/i);
      if (failedQueryMatch) {
        cleaned = cleaned.substring(0, failedQueryMatch.index).trim();
      }

      // Remove complete SQL SELECT queries (including multiline)
      // Match from SELECT to LIMIT or end of string, handling newlines and whitespace
      cleaned = cleaned.replace(/SELECT[\s\S]*?LIMIT\s+\d+[\s\S]*?$/gim, "[SQL query removed]");
      cleaned = cleaned.replace(/SELECT[\s\S]*?FROM[\s\S]*?$/gim, "[SQL query removed]");

      // Remove vector arrays: [number,number,...]::vector patterns
      // Match arrays with 20+ numbers (vectors are typically 1024+ dimensions)
      cleaned = cleaned.replace(
        /\[-?\d+\.?\d*(,\s*-?\d+\.?\d*){20,}\]::vector/gi,
        "[vector array]::vector",
      );
      cleaned = cleaned.replace(/\[-?\d+\.?\d*(,\s*-?\d+\.?\d*){20,}\]/g, "[vector array]");

      // Remove long numeric sequences (fallback for any remaining long number lists)
      cleaned = cleaned.replace(/-?\d+\.?\d*(,\s*-?\d+\.?\d*){50,}/g, "[...numbers...]");

      // Clean up multiple consecutive spaces/newlines
      cleaned = cleaned.replace(/\s+/g, " ").trim();

      return cleaned || errorMessage;
    };

    const errorMessage = error instanceof Error ? error.message : String(error);
    const cleanedMessage = cleanErrorMessage(errorMessage);

    logger.error("Streaming chat error", {
      error: cleanedMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Generate streaming LLM response using @raypx/ai framework
 */
async function generateLLMResponseStream(
  messages: BaseMessage[],
  _userId: string,
  options: ChatOptions & { ragConfig?: Awaited<ReturnType<typeof getRAGConfig>> },
  callbacks: StreamCallbacks,
): Promise<void> {
  const {
    llmProvider = "aliyun",
    llmApiKey,
    llmApiUrl,
    llmModel,
    temperature = 0.7,
    maxTokens = 2000,
    ragConfig,
  } = options;

  logger.debug("Generating streaming LLM response", {
    provider: llmProvider,
    model: llmModel,
    messagesCount: messages.length,
  });

  // Determine API key and URL
  const apiKey = llmApiKey || ragConfig?.apiKey;
  if (!apiKey) {
    throw new Error("LLM API key is required. Please configure it in RAG settings.");
  }

  // Determine API URL and model based on provider
  let apiUrl: string | undefined;
  let defaultModel: string;

  switch (llmProvider) {
    case "aliyun":
      apiUrl =
        llmApiUrl || ragConfig?.apiUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1";
      defaultModel = llmModel || "qwen3-max";
      break;
    case "openai":
      apiUrl = llmApiUrl;
      defaultModel = llmModel || "gpt-4";
      break;
    case "deepseek":
      apiUrl = llmApiUrl || "https://api.deepseek.com/v1";
      defaultModel = llmModel || "deepseek-chat";
      break;
    default:
      throw new Error(`Unsupported LLM provider: ${llmProvider}`);
  }

  try {
    // Create AI client using @raypx/ai framework
    const aiClient = new AIClient({
      provider: llmProvider as LLMProvider,
      apiKey,
      apiUrl,
      model: defaultModel,
      temperature,
      maxTokens,
    });

    logger.debug("Calling streaming LLM API via @raypx/ai", {
      provider: llmProvider,
      apiUrl,
      model: defaultModel,
      temperature,
      maxTokens,
    });

    // Convert BaseMessage[] to ChatMessage[]
    const chatMessages = messages.map((msg) => {
      if (msg instanceof HumanMessage) {
        return { role: "user" as const, content: msg.content as string };
      }
      if (msg instanceof AIMessage) {
        return { role: "assistant" as const, content: msg.content as string };
      }
      if (msg instanceof SystemMessage) {
        return { role: "system" as const, content: msg.content as string };
      }
      return { role: "user" as const, content: String(msg.content) };
    });

    // Stream the response
    let fullAnswer = "";
    let thinking: string | undefined;

    await aiClient.chatStream(
      {
        messages: chatMessages,
        temperature,
        maxTokens,
      },
      (chunk) => {
        if (chunk.type === "chunk" && chunk.content) {
          fullAnswer += chunk.content;
          callbacks.onChunk(chunk.content);
        } else if (chunk.type === "thinking" && chunk.content && callbacks.onThinking) {
          thinking = (thinking || "") + chunk.content;
          callbacks.onThinking(chunk.content);
        }
      },
    );

    logger.debug("Streaming LLM response completed", {
      answerLength: fullAnswer.length,
      hasThinking: !!thinking,
      thinkingLength: thinking?.length,
    });
  } catch (error) {
    logger.error("Failed to generate streaming LLM response", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
      provider: llmProvider,
      apiUrl,
      model: defaultModel,
    });
    throw error;
  }
}

/**
 * Simple Q&A function for single questions
 * Convenience wrapper around chatWithDocument
 */
export async function askQuestion(
  question: string,
  userId: string,
  options: ChatOptions = {},
): Promise<ChatResponse> {
  return chatWithDocument(
    [
      {
        role: "user",
        content: question,
      },
    ],
    userId,
    options,
  );
}
