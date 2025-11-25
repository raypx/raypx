import { and, asc, desc, eq } from "@raypx/database";
import { knowledges as Knowledges } from "@raypx/database/schemas";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";
import { assertExists, handleDatabaseError } from "../utils/error-handler";

/**
 * Knowledges router - handles all knowledge base-related operations
 */
export const knowledgesRouter = {
  /**
   * List all knowledge bases for the current user
   */
  list: protectedProcedure
    .input(
      z
        .object({
          sortBy: z.enum(["createdAt", "name", "status"]).default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
          status: z.enum(["active", "inactive", "all"]).default("all"),
        })
        .partial()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const sortByCol =
        input.sortBy === "name"
          ? Knowledges.name
          : input.sortBy === "status"
            ? Knowledges.status
            : Knowledges.createdAt;
      const orderBy = input.sortOrder === "desc" ? desc(sortByCol) : asc(sortByCol);

      const conditions = [eq(Knowledges.userId, userId)];
      if (input.status === "active") {
        conditions.push(eq(Knowledges.status, "active"));
      } else if (input.status === "inactive") {
        conditions.push(eq(Knowledges.status, "inactive"));
      }

      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const knowledgeBases = await ctx.db.query.knowledges.findMany({
        where,
        orderBy,
      });

      return knowledgeBases.map((kb) => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        status: kb.status,
        settings: kb.settings,
        userId: kb.userId,
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
      }));
    }),

  /**
   * Get a single knowledge base by ID
   */
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const knowledgeBase = await ctx.db.query.knowledges.findFirst({
      where: and(eq(Knowledges.id, input.id), eq(Knowledges.userId, userId)),
    });

    assertExists(knowledgeBase, () => Errors.resourceNotFound("Knowledge Base", input.id));

    return {
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      status: knowledgeBase.status,
      settings: knowledgeBase.settings,
      userId: knowledgeBase.userId,
      createdAt: knowledgeBase.createdAt,
      updatedAt: knowledgeBase.updatedAt,
    };
  }),

  /**
   * Create a new knowledge base
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        description: z.string().trim().max(1000).optional(),
        status: z.enum(["active", "inactive"]).default("active"),
        settings: z.record(z.string(), z.any()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const [created] = await ctx.db
          .insert(Knowledges)
          .values({
            name: input.name,
            description: input.description ?? null,
            status: input.status,
            settings: input.settings ?? null,
            userId,
          })
          .returning();

        assertExists(created, () => Errors.internalError("Failed to create knowledge base"));

        return {
          id: created.id,
          name: created.name,
          description: created.description,
          status: created.status,
          settings: created.settings,
          userId: created.userId,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "create knowledge base");
      }
    }),

  /**
   * Update a knowledge base
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(1000).optional(),
        status: z.enum(["active", "inactive"]).optional(),
        settings: z.record(z.string(), z.any()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id, ...updateData } = input;

      // Verify knowledge base exists and belongs to user
      const existing = await ctx.db.query.knowledges.findFirst({
        where: and(eq(Knowledges.id, id), eq(Knowledges.userId, userId)),
      });

      assertExists(existing, () => Errors.resourceNotFound("Knowledge Base", id));

      try {
        const [updated] = await ctx.db
          .update(Knowledges)
          .set(updateData)
          .where(eq(Knowledges.id, id))
          .returning();

        assertExists(updated, () => Errors.resourceNotFound("Knowledge Base", id));

        return {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          status: updated.status,
          settings: updated.settings,
          userId: updated.userId,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "update knowledge base");
      }
    }),

  /**
   * Delete a knowledge base
   */
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Verify knowledge base exists and belongs to user
    const existing = await ctx.db.query.knowledges.findFirst({
      where: and(eq(Knowledges.id, input), eq(Knowledges.userId, userId)),
    });

    assertExists(existing, () => Errors.resourceNotFound("Knowledge Base", input));

    try {
      await ctx.db.delete(Knowledges).where(eq(Knowledges.id, input));
      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete knowledge base");
    }
  }),
};
