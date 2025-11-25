import { and, asc, desc, eq } from "@raypx/database";
import { documents as Documents, knowledges as Knowledges } from "@raypx/database/schemas";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";
import { assertExists, handleDatabaseError } from "../utils/error-handler";

/**
 * Documents router - handles all document-related operations
 */
export const documentsRouter = {
  /**
   * List all documents for the current user
   */
  list: protectedProcedure
    .input(
      z
        .object({
          knowledgeBaseId: z.string().optional(),
          sortBy: z.enum(["createdAt", "name", "status", "size"]).default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
          status: z.enum(["processing", "completed", "failed", "all"]).default("all"),
        })
        .partial()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const sortByCol =
        input.sortBy === "name"
          ? Documents.name
          : input.sortBy === "status"
            ? Documents.status
            : input.sortBy === "size"
              ? Documents.size
              : Documents.createdAt;
      const orderBy = input.sortOrder === "desc" ? desc(sortByCol) : asc(sortByCol);

      const conditions = [eq(Documents.userId, userId)];

      if (input.knowledgeBaseId) {
        conditions.push(eq(Documents.knowledgeBaseId, input.knowledgeBaseId));
      }

      if (input.status !== "all") {
        conditions.push(eq(Documents.status, input.status));
      }

      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const docs = await ctx.db.query.documents.findMany({
        where,
        orderBy,
      });

      return docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        status: doc.status,
        metadata: doc.metadata,
        knowledgeBaseId: doc.knowledgeBaseId,
        userId: doc.userId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
    }),

  /**
   * Get a single document by ID
   */
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const document = await ctx.db.query.documents.findFirst({
      where: and(eq(Documents.id, input.id), eq(Documents.userId, userId)),
    });

    assertExists(document, () => Errors.resourceNotFound("Document", input.id));

    return {
      id: document.id,
      name: document.name,
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
      status: document.status,
      metadata: document.metadata,
      knowledgeBaseId: document.knowledgeBaseId,
      userId: document.userId,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }),

  /**
   * Create a new document
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        originalName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(100),
        size: z.number().int().min(0),
        knowledgeBaseId: z.string(),
        status: z.enum(["processing", "completed", "failed"]).default("processing"),
        metadata: z.record(z.any()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify knowledge base exists and belongs to user
      const knowledgeBase = await ctx.db.query.knowledges.findFirst({
        where: and(eq(Knowledges.id, input.knowledgeBaseId), eq(Knowledges.userId, userId)),
      });

      if (!knowledgeBase) {
        throw Errors.resourceNotFound("Knowledge Base", input.knowledgeBaseId);
      }

      try {
        const [created] = await ctx.db
          .insert(Documents)
          .values({
            name: input.name,
            originalName: input.originalName,
            mimeType: input.mimeType,
            size: input.size,
            knowledgeBaseId: input.knowledgeBaseId,
            status: input.status,
            metadata: input.metadata ?? null,
            userId,
          })
          .returning();

        assertExists(created, () => Errors.internalError("Failed to create document"));

        return {
          id: created.id,
          name: created.name,
          originalName: created.originalName,
          mimeType: created.mimeType,
          size: created.size,
          status: created.status,
          metadata: created.metadata,
          knowledgeBaseId: created.knowledgeBaseId,
          userId: created.userId,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "create document");
      }
    }),

  /**
   * Update a document
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(255).optional(),
        status: z.enum(["processing", "completed", "failed"]).optional(),
        metadata: z.record(z.any()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id, ...updateData } = input;

      // Verify document exists and belongs to user
      const existing = await ctx.db.query.documents.findFirst({
        where: and(eq(Documents.id, id), eq(Documents.userId, userId)),
      });

      assertExists(existing, () => Errors.resourceNotFound("Document", id));

      try {
        const [updated] = await ctx.db
          .update(Documents)
          .set(updateData)
          .where(eq(Documents.id, id))
          .returning();

        assertExists(updated, () => Errors.resourceNotFound("Document", id));

        return {
          id: updated.id,
          name: updated.name,
          originalName: updated.originalName,
          mimeType: updated.mimeType,
          size: updated.size,
          status: updated.status,
          metadata: updated.metadata,
          knowledgeBaseId: updated.knowledgeBaseId,
          userId: updated.userId,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "update document");
      }
    }),

  /**
   * Delete a document
   */
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Verify document exists and belongs to user
    const existing = await ctx.db.query.documents.findFirst({
      where: and(eq(Documents.id, input), eq(Documents.userId, userId)),
    });

    assertExists(existing, () => Errors.resourceNotFound("Document", input));

    try {
      await ctx.db.delete(Documents).where(eq(Documents.id, input));
      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete document");
    }
  }),
};
