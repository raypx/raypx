import { createAIServices } from "@raypx/ai";
import { and, db, desc, eq } from "@raypx/database";
import {
  aiConversations,
  aiGenerations,
  aiMessages,
  CreateAIConversationSchema,
  CreateAIGenerationSchema,
} from "@raypx/database/schemas";
import { Cache } from "@raypx/redis";
import { z } from "zod";

import { o, protectedProcedure } from "../middleware";

export const aiRouter = {
  // Chat endpoints
  chat: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        message: z.string(),
        model: z.string().optional(),
        stream: z.boolean().default(false),
      }),
    )
    .handler(async ({ input, context }) => {
      const { conversationId, message, model, stream } = input;
      const userId = context.session.user.id;

      // Initialize AI services
      const cache = new Cache();
      const ai = createAIServices(cache, process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY);

      // Get or create conversation
      let conversation;
      if (conversationId) {
        const existing = await db.query.aiConversations.findFirst({
          where: eq(aiConversations.id, conversationId),
        });
        if (!existing) {
          throw new Error("Conversation not found");
        }
        conversation = existing;
      } else {
        // Create new conversation with title from first message
        const title = message.slice(0, 50) + (message.length > 50 ? "..." : "");
        const [newConversation] = await db
          .insert(aiConversations)
          .values({
            userId,
            title,
            model: model ?? "gpt-4o",
            provider: "openai",
          })
          .returning();
        conversation = newConversation;
      }

      // Save user message
      await db.insert(aiMessages).values({
        conversationId: conversation.id,
        role: "user",
        content: message,
      });

      // Get conversation history
      const history = await db.query.aiMessages.findMany({
        where: eq(aiMessages.conversationId, conversation.id),
        orderBy: [desc(aiMessages.createdAt)],
        limit: 20,
      });

      const messages = history.reverse().map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      }));

      // Call AI
      const response = await ai.chat.chat(messages, { model: conversation.model });

      // Save assistant message
      await db.insert(aiMessages).values({
        conversationId: conversation.id,
        role: "assistant",
        content: response.content,
        tokens: response.usage?.totalTokens,
      });

      // Update conversation timestamp
      await db
        .update(aiConversations)
        .set({ updatedAt: new Date() })
        .where(eq(aiConversations.id, conversation.id));

      return {
        conversationId: conversation.id,
        content: response.content,
        usage: response.usage,
      };
    }),

  getConversations: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const { limit, offset } = input;
      const userId = context.session.user.id;

      const conversations = await db.query.aiConversations.findMany({
        where: eq(aiConversations.userId, userId),
        orderBy: [desc(aiConversations.updatedAt)],
        limit,
        offset,
      });

      return conversations;
    }),

  getConversation: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const { id } = input;
      const userId = context.session.user.id;

      const conversation = await db.query.aiConversations.findFirst({
        where: and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)),
      });

      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const messages = await db.query.aiMessages.findMany({
        where: eq(aiMessages.conversationId, id),
        orderBy: [desc(aiMessages.createdAt)],
      });

      return {
        ...conversation,
        messages: messages.reverse(),
      };
    }),

  deleteConversation: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const { id } = input;
      const userId = context.session.user.id;

      await db
        .delete(aiConversations)
        .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));

      return { success: true };
    }),

  // Generation endpoints
  generate: protectedProcedure
    .input(
      z.object({
        type: z.string(),
        prompt: z.string(),
        model: z.string().optional(),
        temperature: z.number().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { type, prompt, model, temperature } = input;
      const userId = context.session.user.id;

      // Initialize AI services
      const cache = new Cache();
      const ai = createAIServices(cache, process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY);

      // Call AI
      const response = await ai.generation.generate(prompt, type, {
        model,
        temperature,
      });

      // Save generation
      const [generation] = await db
        .insert(aiGenerations)
        .values({
          userId,
          type,
          prompt,
          result: response.content,
          model: model ?? "gpt-4o",
          provider: "openai",
          tokens: response.usage?.totalTokens,
        })
        .returning();

      return generation;
    }),

  getGenerations: protectedProcedure
    .input(
      z.object({
        type: z.string().optional(),
        limit: z.number().default(20),
        offset: z.number().default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const { type, limit, offset } = input;
      const userId = context.session.user.id;

      const where = type
        ? and(eq(aiGenerations.userId, userId), eq(aiGenerations.type, type))
        : eq(aiGenerations.userId, userId);

      const generations = await db.query.aiGenerations.findMany({
        where,
        orderBy: [desc(aiGenerations.createdAt)],
        limit,
        offset,
      });

      return generations;
    }),

  deleteGeneration: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const { id } = input;
      const userId = context.session.user.id;

      await db
        .delete(aiGenerations)
        .where(and(eq(aiGenerations.id, id), eq(aiGenerations.userId, userId)));

      return { success: true };
    }),

  // Analysis endpoints
  analyze: protectedProcedure
    .input(
      z.object({
        dataType: z.string(),
        data: z.any(),
        analysisType: z.string(),
        model: z.string().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { dataType, data, analysisType, model } = input;
      const userId = context.session.user.id;

      // Initialize AI services
      const cache = new Cache();
      const ai = createAIServices(cache, process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY);

      // Call AI
      const result = await ai.analysis.analyze(data, dataType, analysisType, {
        model,
      });

      // Save analysis
      const [analysis] = await db
        .insert(aiGenerations)
        .values({
          userId,
          type: "analysis",
          prompt: JSON.stringify(data),
          result: JSON.stringify(result),
          model: model ?? "gpt-4o",
          provider: "openai",
          tokens: result.metadata?.tokens as number | undefined,
        })
        .returning();

      return {
        ...analysis,
        parsedResult: result,
      };
    }),

  getAnalyses: protectedProcedure
    .input(
      z.object({
        dataType: z.string().optional(),
        analysisType: z.string().optional(),
        limit: z.number().default(20),
        offset: z.number().default(0),
      }),
    )
    .handler(async ({ input, context }) => {
      const { dataType, analysisType, limit, offset } = input;
      const userId = context.session.user.id;

      const where = and(eq(aiGenerations.userId, userId), eq(aiGenerations.type, "analysis"));

      const analyses = await db.query.aiGenerations.findMany({
        where,
        orderBy: [desc(aiGenerations.createdAt)],
        limit,
        offset,
      });

      return analyses;
    }),
};
