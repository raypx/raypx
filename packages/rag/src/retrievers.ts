/**
 * Advanced retrievers for RAG
 * Provides MultiQueryRetriever and ContextualCompressionRetriever
 *
 * Uses dynamic imports based on current LangChain version
 */

import { Document } from "@langchain/core/documents";
import type { Embeddings } from "@langchain/core/embeddings";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseRetriever } from "@langchain/core/retrievers";
import { RunnableSequence } from "@langchain/core/runnables";

import { logger } from "./utils";

export interface RetrieverOptions {
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

  /**
   * Number of query variants to generate (for MultiQueryRetriever)
   * Default: 3
   */
  queryVariants?: number;

  /**
   * LLM to use for query generation and compression
   * Required if useMultiQuery or useCompression is true
   */
  llm?: BaseLanguageModel;

  /**
   * Embeddings to use for EmbeddingsRedundantFilter
   * Optional, only needed if using compression with embeddings-based filtering
   */
  embeddings?: Embeddings;
}

/**
 * Create an advanced retriever with optional MultiQuery and Compression
 * Optimized: Combined wrapper that handles both features in a single class
 *
 * @param baseRetriever - Base retriever (e.g., from PGVectorStore)
 * @param options - Retriever options
 * @returns Enhanced retriever
 */
export async function createAdvancedRetriever(
  baseRetriever: BaseRetriever,
  options: RetrieverOptions = {},
): Promise<BaseRetriever> {
  const { useMultiQuery = true, useCompression = true, queryVariants = 3, llm } = options;

  if (!useMultiQuery && !useCompression) {
    return baseRetriever;
  }

  if (!llm) {
    logger.warn("Advanced retrievers require LLM, falling back to base retriever");
    return baseRetriever;
  }

  try {
    // Create prompt templates and chains
    let queryGenerator: RunnableSequence<any, string> | null = null;
    if (useMultiQuery) {
      const multiQueryPrompt = ChatPromptTemplate.fromTemplate(`
You are a helpful retrieval assistant.

Based on the following question, generate **${queryVariants} different search queries**, one query per line:

Question: {question}

${Array.from({ length: queryVariants }, (_, i) => `Query ${i + 1}:`).join("\n")}
`);
      queryGenerator = RunnableSequence.from([multiQueryPrompt, llm, new StringOutputParser()]);
    }

    // Create compression chain using RunnableSequence (simplest approach)
    let compressionChain: RunnableSequence<any, any> | null = null;
    if (useCompression) {
      const compressorPrompt = ChatPromptTemplate.fromTemplate(`
You are a document compression expert.

Extract the most relevant **key sentences** from the following documents related to the question. Return at most 3 paragraphs:

Question: {question}
Documents: {documents}

Compressed result:
`);
      compressionChain = RunnableSequence.from([compressorPrompt, llm]);
    }

    // Create unified advanced retriever wrapper
    class AdvancedRetrieverWrapper extends BaseRetriever {
      lc_namespace = ["raypx", "rag", "retrievers"];

      async _getRelevantDocuments(question: string): Promise<Document[]> {
        try {
          let queries = [question];
          let docs: Document[] = [];

          // Step 1: Generate multiple queries if useMultiQuery is enabled
          if (useMultiQuery && queryGenerator) {
            try {
              const queriesText = await queryGenerator.invoke({ question });
              const queryList = queriesText
                .split("\n")
                .map((q) => q.trim())
                .filter(
                  (q) =>
                    q.length > 0 &&
                    !q.toLowerCase().startsWith("query") &&
                    !q.match(/^query\s+\d+:/i),
                )
                .slice(0, queryVariants);

              if (queryList.length > 0) {
                queries = queryList;
                logger.debug("Generated queries for multi-query retriever", {
                  question,
                  queries: queryList,
                });
              }
            } catch (error) {
              logger.warn("Multi-query generation failed, using original query", {
                error: error instanceof Error ? error.message : String(error),
              });
              queries = [question];
            }
          }

          // Step 2: Retrieve documents using all queries
          const allDocs = await Promise.all(
            queries.map(async (q) => {
              try {
                return await baseRetriever.invoke(q);
              } catch (error) {
                logger.warn("Failed to retrieve documents for query", {
                  query: q,
                  error: error instanceof Error ? error.message : String(error),
                });
                return [];
              }
            }),
          );

          // Step 3: Flatten and deduplicate documents
          const uniqueDocs = new Map<string, Document>();
          for (const docArray of allDocs) {
            for (const doc of docArray) {
              // Use pageContent as key for deduplication
              const key = doc.pageContent.trim();
              if (!uniqueDocs.has(key)) {
                uniqueDocs.set(key, doc);
              }
            }
          }
          docs = Array.from(uniqueDocs.values());

          logger.debug("Retrieval completed", {
            queriesUsed: queries.length,
            totalDocs: docs.length,
            useMultiQuery,
            useCompression,
          });

          // Step 4: Compress documents if useCompression is enabled
          if (useCompression && compressionChain && docs.length > 0) {
            try {
              const documentsText = docs.map((d) => d.pageContent).join("\n\n");
              const compressedResult = await compressionChain.invoke({
                question,
                documents: documentsText,
              });

              const compressedText =
                typeof compressedResult === "string"
                  ? compressedResult
                  : compressedResult?.content || String(compressedResult);

              const compressedDoc = new Document({
                pageContent: compressedText.trim(),
                metadata: docs[0]?.metadata || {},
              });

              logger.debug("LLM compression completed", {
                originalDocs: docs.length,
                compressedLength: compressedText.length,
              });

              return [compressedDoc];
            } catch (error) {
              logger.warn("Compression failed, returning original documents", {
                error: error instanceof Error ? error.message : String(error),
              });
              return docs;
            }
          }

          return docs;
        } catch (error) {
          logger.warn("Advanced retriever failed, falling back to base retriever", {
            error: error instanceof Error ? error.message : String(error),
          });
          return await baseRetriever.invoke(question);
        }
      }
    }

    const retriever = new AdvancedRetrieverWrapper({}) as BaseRetriever;
    logger.info("Advanced retriever created successfully", {
      useMultiQuery,
      useCompression,
    });

    return retriever;
  } catch (error) {
    logger.warn("Failed to create advanced retriever, using base retriever", {
      error: error instanceof Error ? error.message : String(error),
    });
    return baseRetriever;
  }
}
