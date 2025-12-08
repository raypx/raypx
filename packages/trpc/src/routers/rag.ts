/**
 * RAG router - handles RAG-related operations (search, chat)
 */

import { askQuestion, chatWithDocument, searchSimilarChunks } from "@raypx/rag";
import { z } from "zod/v4";
import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";

/**
 * RAG router - handles search and chat operations
 */
export const ragRouter = {
  /**
   * Search for similar chunks in documents
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(1).max(1000),
        limit: z.number().int().min(1).max(50).default(5),
        threshold: z.number().min(0).max(1).default(0.6),
        documentId: z.string().optional(),
        datasetId: z.string().optional(),
        includeMetadata: z.boolean().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const results = await searchSimilarChunks(input.query, userId, {
          limit: input.limit,
          threshold: input.threshold,
          documentId: input.documentId,
          datasetId: input.datasetId,
          includeMetadata: input.includeMetadata,
        });

        return results;
      } catch (error) {
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to search documents",
        );
      }
    }),

  /**
   * Ask a question about documents
   */
  ask: protectedProcedure
    .input(
      z.object({
        question: z.string().trim().min(1).max(2000),
        documentId: z.string().optional(),
        datasetId: z.string().optional(),
        maxChunks: z.number().int().min(1).max(20).default(5),
        similarityThreshold: z.number().min(0).max(1).default(0.6),
        temperature: z.number().min(0).max(2).default(0.7),
        maxTokens: z.number().int().min(100).max(4000).default(2000),
        llmProvider: z.enum(["aliyun", "openai", "deepseek"]).optional(),
        llmModel: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const response = await askQuestion(input.question, userId, {
          documentId: input.documentId,
          datasetId: input.datasetId,
          maxChunks: input.maxChunks,
          similarityThreshold: input.similarityThreshold,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          llmProvider: input.llmProvider,
          llmModel: input.llmModel,
        });

        return response;
      } catch (error) {
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to generate answer",
        );
      }
    }),

  /**
   * Chat with documents (conversational)
   */
  chat: protectedProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string().trim().min(1).max(2000),
          }),
        ),
        documentId: z.string().optional(),
        datasetId: z.string().optional(),
        maxChunks: z.number().int().min(1).max(20).default(5),
        similarityThreshold: z.number().min(0).max(1).default(0.6),
        systemPrompt: z.string().max(1000).optional(),
        temperature: z.number().min(0).max(2).default(0.7),
        maxTokens: z.number().int().min(100).max(4000).default(2000),
        llmProvider: z.enum(["aliyun", "openai", "deepseek"]).optional(),
        llmModel: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const response = await chatWithDocument(input.messages, userId, {
          documentId: input.documentId,
          datasetId: input.datasetId,
          maxChunks: input.maxChunks,
          similarityThreshold: input.similarityThreshold,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          llmProvider: input.llmProvider,
          llmModel: input.llmModel,
        });

        return response;
      } catch (error) {
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to generate chat response",
        );
      }
    }),
};
