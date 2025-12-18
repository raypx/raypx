/**
 * Conversations router - handles conversation history management
 */

import {
  clearConversationMessages,
  createConversation,
  deleteConversation,
  getUserConversations,
  loadConversationMessages,
  saveMessage,
  updateConversationSummary,
} from "@raypx/rag";
import { z } from "zod/v4";
import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";

/**
 * Conversations router - handles conversation history
 */
export const conversationsRouter = {
  /**
   * Create a new conversation
   */
  create: protectedProcedure
    .input(
      z.object({
        documentId: z.string().optional(),
        datasetId: z.string().optional(),
        title: z.string().max(255).optional(),
        metadata: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const conversationId = await createConversation(userId, {
          documentId: input.documentId,
          datasetId: input.datasetId,
          title: input.title,
          metadata: input.metadata,
        });

        return { id: conversationId };
      } catch (error) {
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to create conversation",
        );
      }
    }),

  /**
   * Get user's conversations
   */
  list: protectedProcedure
    .input(
      z.object({
        documentId: z.string().optional(),
        datasetId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const conversations = await getUserConversations(userId, {
          documentId: input.documentId,
          datasetId: input.datasetId,
          limit: input.limit,
        });

        return conversations;
      } catch (error) {
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to list conversations",
        );
      }
    }),

  /**
   * Get conversation messages
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        limit: z.number().int().min(1).max(1000).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        // Verify conversation ownership
        const conversations = await getUserConversations(userId);
        const conversation = conversations.find((c) => c.id === input.conversationId);

        if (!conversation) {
          throw Errors.resourceNotFound("Conversation", input.conversationId);
        }

        const messages = await loadConversationMessages(input.conversationId, input.limit);

        return messages;
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw error;
        }
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to load conversation messages",
        );
      }
    }),

  /**
   * Save a message to conversation
   */
  saveMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().trim().min(1).max(10000),
        thinking: z.string().optional(),
        sources: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        // Verify conversation ownership
        const conversations = await getUserConversations(userId);
        const conversation = conversations.find((c) => c.id === input.conversationId);

        if (!conversation) {
          throw Errors.resourceNotFound("Conversation", input.conversationId);
        }

        await saveMessage(input.conversationId, {
          role: input.role,
          content: input.content,
          thinking: input.thinking,
          sources: input.sources,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw error;
        }
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to save message",
        );
      }
    }),

  /**
   * Update conversation summary
   */
  updateSummary: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        summary: z.string().max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        // Verify conversation ownership
        const conversations = await getUserConversations(userId);
        const conversation = conversations.find((c) => c.id === input.conversationId);

        if (!conversation) {
          throw Errors.resourceNotFound("Conversation", input.conversationId);
        }

        await updateConversationSummary(input.conversationId, input.summary);

        return { success: true };
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw error;
        }
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to update conversation summary",
        );
      }
    }),

  /**
   * Clear all messages from a conversation
   */
  clearMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        await clearConversationMessages(input.conversationId, userId);

        return { success: true };
      } catch (error) {
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to clear conversation messages",
        );
      }
    }),

  /**
   * Delete a conversation
   */
  delete: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        await deleteConversation(input.conversationId, userId);

        return { success: true };
      } catch (error) {
        throw Errors.internalError(
          error instanceof Error ? error.message : "Failed to delete conversation",
        );
      }
    }),
};
