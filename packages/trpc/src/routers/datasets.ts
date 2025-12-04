import { and, asc, desc, eq, sql } from "@raypx/database";
import { datasets as Datasets } from "@raypx/database/schemas";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";
import { assertExists, handleDatabaseError } from "../utils/error-handler";

/**
 * Datasets router - handles all dataset-related operations
 */
export const datasetsRouter = {
  /**
   * List all datasets for the current user with pagination
   */
  list: protectedProcedure
    .input(
      z
        .object({
          sortBy: z.enum(["createdAt", "name", "status"]).default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
          status: z.enum(["active", "inactive", "all"]).default("all"),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(12),
        })
        .partial()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 12;
      const offset = (page - 1) * pageSize;

      const sortByCol =
        input.sortBy === "name"
          ? Datasets.name
          : input.sortBy === "status"
            ? Datasets.status
            : Datasets.createdAt;
      const orderBy = input.sortOrder === "desc" ? desc(sortByCol) : asc(sortByCol);

      const conditions = [eq(Datasets.userId, userId)];
      if (input.status === "active") {
        conditions.push(eq(Datasets.status, "active"));
      } else if (input.status === "inactive") {
        conditions.push(eq(Datasets.status, "inactive"));
      }

      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const [items, totalRow] = await Promise.all([
        ctx.db.query.datasets.findMany({
          where,
          orderBy,
          limit: pageSize,
          offset,
        }),
        ctx.db
          .select({ value: sql<number>`count(*)::int` })
          .from(Datasets)
          .where(where as any)
          .then((r) => r[0]),
      ]);

      const total = totalRow?.value ?? 0;

      return {
        items: items.map((ds) => ({
          id: ds.id,
          name: ds.name,
          description: ds.description,
          status: ds.status,
          settings: ds.settings,
          userId: ds.userId,
          createdAt: ds.createdAt,
          updatedAt: ds.updatedAt,
        })),
        total,
        page,
        pageSize,
      };
    }),

  /**
   * Get a single dataset by ID
   */
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const dataset = await ctx.db.query.datasets.findFirst({
      where: and(eq(Datasets.id, input.id), eq(Datasets.userId, userId)),
    });

    assertExists(dataset, () => Errors.resourceNotFound("Dataset", input.id));

    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      status: dataset.status,
      settings: dataset.settings,
      userId: dataset.userId,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    };
  }),

  /**
   * Create a new dataset
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
          .insert(Datasets)
          .values({
            name: input.name,
            description: input.description ?? null,
            status: input.status,
            settings: input.settings ?? null,
            userId,
          })
          .returning();

        assertExists(created, () => Errors.internalError("Failed to create dataset"));

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
        throw handleDatabaseError(error, "create dataset");
      }
    }),

  /**
   * Update a dataset
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

      // Verify dataset exists and belongs to user
      const existing = await ctx.db.query.datasets.findFirst({
        where: and(eq(Datasets.id, id), eq(Datasets.userId, userId)),
      });

      assertExists(existing, () => Errors.resourceNotFound("Dataset", id));

      try {
        const [updated] = await ctx.db
          .update(Datasets)
          .set(updateData)
          .where(eq(Datasets.id, id))
          .returning();

        assertExists(updated, () => Errors.resourceNotFound("Dataset", id));

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
        throw handleDatabaseError(error, "update dataset");
      }
    }),

  /**
   * Delete a dataset
   */
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Verify dataset exists and belongs to user
    const existing = await ctx.db.query.datasets.findFirst({
      where: and(eq(Datasets.id, input), eq(Datasets.userId, userId)),
    });

    assertExists(existing, () => Errors.resourceNotFound("Dataset", input));

    try {
      await ctx.db.delete(Datasets).where(eq(Datasets.id, input));
      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete dataset");
    }
  }),
};
