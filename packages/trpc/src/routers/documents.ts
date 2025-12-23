import { and, asc, desc, eq, ilike, or, sql } from "@raypx/database";
import { datasets as Datasets, documents as Documents } from "@raypx/database/schemas";
import { z } from "zod/v4";
import { Errors } from "../errors";
import { logger } from "../logger";
import { protectedProcedure } from "../trpc";
import { assertExists, handleDatabaseError } from "../utils/error-handler";

/**
 * Documents router - handles all document-related operations
 */
export const documentsRouter = {
  /**
   * List all documents for the current user with pagination
   */
  list: protectedProcedure
    .input(
      z
        .object({
          datasetId: z.string().optional(),
          q: z.string().trim().min(1).max(200).optional(),
          sortBy: z.enum(["createdAt", "name", "status", "size"]).default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
          status: z
            .union([
              z.enum(["processing", "uploaded", "completed", "failed", "all"]),
              z.array(z.enum(["processing", "uploaded", "completed", "failed"])),
            ])
            .optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(10),
        })
        .partial()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const offset = (page - 1) * pageSize;

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

      if (input.datasetId) {
        conditions.push(eq(Documents.datasetId, input.datasetId));
      }

      if (input.q) {
        const like = `%${input.q}%`;
        conditions.push(
          or(ilike(Documents.name, like), ilike(Documents.originalName, like)) as any,
        );
      }

      if (input.status) {
        if (Array.isArray(input.status) && input.status.length > 0) {
          // Multiple statuses: use OR conditions
          conditions.push(or(...input.status.map((s) => eq(Documents.status, s))) as any);
        } else if (typeof input.status === "string" && input.status !== "all") {
          // Single status
          conditions.push(eq(Documents.status, input.status));
        }
      }

      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const [items, totalRow] = await Promise.all([
        ctx.db.query.documents.findMany({
          where,
          orderBy,
          limit: pageSize,
          offset,
        }),
        ctx.db
          .select({ value: sql<number>`count(*)::int` })
          .from(Documents)
          .where(where as any)
          .then((r) => r[0]),
      ]);

      const total = totalRow?.value ?? 0;

      return {
        items: items.map((doc) => ({
          id: doc.id,
          name: doc.name,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          size: doc.size,
          status: doc.status,
          metadata: doc.metadata,
          datasetId: doc.datasetId,
          userId: doc.userId,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })),
        total,
        page,
        pageSize,
      };
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
      datasetId: document.datasetId,
      userId: document.userId,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }),

  /**
   * Create a new document
   * If storageKey exists in metadata, automatically triggers vectorization
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        originalName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(100),
        size: z.number().int().min(0),
        datasetId: z.string(),
        status: z.enum(["processing", "uploaded", "completed", "failed"]).default("processing"),
        metadata: z.record(z.string(), z.any()).optional(),
        autoVectorize: z.boolean().default(false), // Auto-vectorize if storageKey exists (disabled by default, use manual trigger)
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { autoVectorize, ...documentData } = input;

      // Verify dataset exists and belongs to user
      const dataset = await ctx.db.query.datasets.findFirst({
        where: and(eq(Datasets.id, documentData.datasetId), eq(Datasets.userId, userId)),
      });

      if (!dataset) {
        throw Errors.resourceNotFound("Dataset", documentData.datasetId);
      }

      try {
        const [created] = await ctx.db
          .insert(Documents)
          .values({
            name: documentData.name,
            originalName: documentData.originalName,
            mimeType: documentData.mimeType,
            size: documentData.size,
            datasetId: documentData.datasetId,
            status: documentData.status,
            metadata: documentData.metadata ?? null,
            userId,
          })
          .returning();

        assertExists(created, () => Errors.internalError("Failed to create document"));

        // Auto-vectorize if storageKey exists and autoVectorize is true
        if (autoVectorize && created.metadata && typeof created.metadata === "object") {
          const metadata = created.metadata as Record<string, unknown>;
          if (metadata.storageKey && typeof metadata.storageKey === "string") {
            // Trigger vectorization asynchronously (don't block the response)
            setImmediate(async () => {
              try {
                const { vectorizeDocument } = await import("@raypx/rag");
                await vectorizeDocument(created.id, userId);
                // Status will be updated to "completed" by vectorizeDocument
              } catch (error) {
                logger.error("Failed to vectorize document", {
                  documentId: created.id,
                  error,
                });
                // Update document status to failed
                await ctx.db
                  .update(Documents)
                  .set({ status: "failed" })
                  .where(eq(Documents.id, created.id));
              }
            });
          }
        }

        return {
          id: created.id,
          name: created.name,
          originalName: created.originalName,
          mimeType: created.mimeType,
          size: created.size,
          status: created.status,
          metadata: created.metadata,
          datasetId: created.datasetId,
          userId: created.userId,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "create document");
      }
    }),

  /**
   * Vectorize a document (parse, chunk, and generate embeddings)
   */
  vectorize: protectedProcedure
    .input(
      z.object({
        documentId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify document exists and belongs to user
      const document = await ctx.db.query.documents.findFirst({
        where: and(eq(Documents.id, input.documentId), eq(Documents.userId, userId)),
      });

      if (!document) {
        throw Errors.resourceNotFound("Document", input.documentId);
      }

      // Import vectorize function dynamically to avoid circular dependencies
      const { vectorizeDocument } = await import("@raypx/rag");

      try {
        const result = await vectorizeDocument(input.documentId, userId);

        return result;
      } catch (error) {
        // Log detailed error information for debugging
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error("Vectorization failed", {
          documentId: input.documentId,
          userId,
          error: errorMessage,
          stack: errorStack,
          provider: process.env.EMBEDDING_PROVIDER,
          model: process.env.EMBEDDING_MODEL,
        });

        // Update document status to failed if vectorization fails
        await ctx.db
          .update(Documents)
          .set({ status: "failed" })
          .where(eq(Documents.id, input.documentId));

        throw Errors.internalError(errorMessage || "Failed to vectorize document");
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
        status: z.enum(["processing", "uploaded", "completed", "failed"]).optional(),
        metadata: z.record(z.string(), z.any()).optional(),
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
          datasetId: updated.datasetId,
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
