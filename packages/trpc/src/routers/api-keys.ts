import { and, asc, desc, eq, sql } from "@raypx/database";
import { apikey as ApiKey } from "@raypx/database/schemas";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";
import { assertExists, handleDatabaseError } from "../utils/error-handler";

/**
 * API Keys router - handles all API key-related operations
 */
export const apiKeysRouter = {
  /**
   * List all API keys for the current user with pagination
   */
  list: protectedProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(10),
          sortBy: z.enum(["createdAt", "name", "lastRequest", "requestCount"]).default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
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
          ? ApiKey.name
          : input.sortBy === "lastRequest"
            ? ApiKey.lastRequest
            : input.sortBy === "requestCount"
              ? ApiKey.requestCount
              : ApiKey.createdAt;
      const orderBy = input.sortOrder === "desc" ? desc(sortByCol) : asc(sortByCol);

      const where = eq(ApiKey.userId, userId);

      const [keys, totalRow] = await Promise.all([
        ctx.db.query.apikey.findMany({
          where,
          orderBy,
          limit: pageSize,
          offset,
        }),
        ctx.db
          .select({ value: sql<number>`count(*)::int` })
          .from(ApiKey)
          .where(where as any)
          .then((r) => r[0]),
      ]);

      const total = totalRow?.value ?? 0;

      // Mask the keys for security (only show prefix and last 4 characters)
      return {
        items: keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix || "",
          key: key.prefix
            ? `${key.prefix}${"•".repeat(Math.max(0, (key.key?.length || 0) - (key.prefix?.length || 0) - 4))}${key.key?.slice(-4) || ""}`
            : `••••••••${key.key?.slice(-4) || ""}`,
          enabled: key.enabled ?? true,
          createdAt: key.createdAt,
          lastRequest: key.lastRequest,
          requestCount: key.requestCount ?? 0,
          remaining: key.remaining,
          expiresAt: key.expiresAt,
          rateLimitEnabled: key.rateLimitEnabled ?? true,
          rateLimitMax: key.rateLimitMax ?? 10,
          rateLimitTimeWindow: key.rateLimitTimeWindow ?? 86_400_000,
        })),
        total,
        page,
        pageSize,
      };
    }),

  /**
   * Get API usage statistics for the current user
   * Returns aggregated stats without fetching all keys
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const where = eq(ApiKey.userId, userId);

    const [stats] = await Promise.all([
      ctx.db
        .select({
          totalKeys: sql<number>`count(*)::int`,
          activeKeys: sql<number>`count(*) filter (where ${ApiKey.enabled} = true)::int`,
          totalRequests: sql<number>`coalesce(sum(${ApiKey.requestCount}), 0)::int`,
        })
        .from(ApiKey)
        .where(where as any)
        .then((r) => r[0]),
    ]);

    return {
      totalKeys: stats?.totalKeys ?? 0,
      activeKeys: stats?.activeKeys ?? 0,
      totalRequests: stats?.totalRequests ?? 0,
    };
  }),

  /**
   * Get a single API key by ID
   * Only returns the full key if it was just created (within last 5 minutes)
   */
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const key = await ctx.db.query.apikey.findFirst({
      where: and(eq(ApiKey.id, input.id), eq(ApiKey.userId, userId)),
    });

    assertExists(key, () => Errors.resourceNotFound("API Key", input.id));

    // Check if key was created recently (within 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isRecentlyCreated = key.createdAt && new Date(key.createdAt) > fiveMinutesAgo;

    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix || "",
      key: isRecentlyCreated
        ? key.key
        : key.prefix
          ? `${key.prefix}${"•".repeat(Math.max(0, (key.key?.length || 0) - (key.prefix?.length || 0) - 4))}${key.key?.slice(-4) || ""}`
          : `••••••••${key.key?.slice(-4) || ""}`,
      enabled: key.enabled ?? true,
      createdAt: key.createdAt,
      lastRequest: key.lastRequest,
      requestCount: key.requestCount ?? 0,
      remaining: key.remaining,
      expiresAt: key.expiresAt,
      rateLimitEnabled: key.rateLimitEnabled ?? true,
      rateLimitMax: key.rateLimitMax ?? 10,
      rateLimitTimeWindow: key.rateLimitTimeWindow ?? 86_400_000,
    };
  }),

  /**
   * Create a new API key
   * Uses Better Auth API to generate the key
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        expiresAt: z
          .union([
            z.date(),
            z
              .string()
              .transform((v) => new Date(v))
              .pipe(z.date()),
            z.null(),
          ])
          .optional(),
        rateLimitMax: z.number().int().min(1).max(1_000_000).optional(),
        rateLimitTimeWindow: z.number().int().min(1000).optional(), // milliseconds
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        // Generate a secure API key
        const crypto = await import("node:crypto");
        const keyValue = `sk_live_${crypto.randomBytes(32).toString("base64url")}`;
        const prefix = "sk_live_";

        // Create API key in database
        const [createdKey] = await ctx.db
          .insert(ApiKey)
          .values({
            name: input.name,
            key: keyValue,
            prefix,
            userId,
            enabled: true,
            rateLimitEnabled: true,
            rateLimitMax: input.rateLimitMax ?? 10,
            rateLimitTimeWindow: input.rateLimitTimeWindow ?? 86_400_000,
            requestCount: 0,
            expiresAt: input.expiresAt ?? null,
          })
          .returning();

        assertExists(createdKey, () => Errors.internalError("Failed to create API key"));

        return {
          id: createdKey.id,
          name: createdKey.name,
          prefix: createdKey.prefix || "",
          key: createdKey.key, // Return full key only on creation
          enabled: createdKey.enabled ?? true,
          createdAt: createdKey.createdAt,
          expiresAt: createdKey.expiresAt,
          rateLimitEnabled: createdKey.rateLimitEnabled ?? true,
          rateLimitMax: createdKey.rateLimitMax ?? 10,
          rateLimitTimeWindow: createdKey.rateLimitTimeWindow ?? 86_400_000,
        };
      } catch (error) {
        if (error instanceof Error && "code" in error) {
          throw error;
        }
        throw Errors.businessRuleViolation(
          "API key creation failed",
          error instanceof Error ? error.message : "Unknown error occurred",
        );
      }
    }),

  /**
   * Update an API key
   * Users can only update their own keys
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(255).optional(),
        enabled: z.boolean().optional(),
        rateLimitEnabled: z.boolean().optional(),
        rateLimitMax: z.number().int().min(1).max(1_000_000).optional(),
        rateLimitTimeWindow: z.number().int().min(1000).optional(),
        expiresAt: z
          .union([
            z.date(),
            z
              .string()
              .transform((v) => new Date(v))
              .pipe(z.date()),
            z.null(),
          ])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id, ...updateData } = input;

      // Verify key exists and belongs to user
      const existing = await ctx.db.query.apikey.findFirst({
        where: and(eq(ApiKey.id, id), eq(ApiKey.userId, userId)),
      });

      assertExists(existing, () => Errors.resourceNotFound("API Key", id));

      try {
        const [updated] = await ctx.db
          .update(ApiKey)
          .set(updateData)
          .where(eq(ApiKey.id, id))
          .returning();

        assertExists(updated, () => Errors.resourceNotFound("API Key", id));

        return {
          id: updated.id,
          name: updated.name,
          prefix: updated.prefix || "",
          key: `${updated.prefix || ""}${"•".repeat(Math.max(0, (updated.key?.length || 0) - (updated.prefix?.length || 0) - 4))}${updated.key?.slice(-4) || ""}`,
          enabled: updated.enabled ?? true,
          createdAt: updated.createdAt,
          lastRequest: updated.lastRequest,
          requestCount: updated.requestCount ?? 0,
          remaining: updated.remaining,
          expiresAt: updated.expiresAt,
          rateLimitEnabled: updated.rateLimitEnabled ?? true,
          rateLimitMax: updated.rateLimitMax ?? 10,
          rateLimitTimeWindow: updated.rateLimitTimeWindow ?? 86_400_000,
        };
      } catch (error) {
        throw handleDatabaseError(error, "update API key");
      }
    }),

  /**
   * Delete an API key
   * Users can only delete their own keys
   */
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Verify key exists and belongs to user
    const existing = await ctx.db.query.apikey.findFirst({
      where: and(eq(ApiKey.id, input), eq(ApiKey.userId, userId)),
    });

    assertExists(existing, () => Errors.resourceNotFound("API Key", input));

    try {
      // Delete API key directly from database
      await ctx.db.delete(ApiKey).where(eq(ApiKey.id, input));
      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete API key");
    }
  }),
};
