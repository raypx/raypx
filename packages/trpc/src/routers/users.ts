import { auth } from "@raypx/auth/server";
import { and, desc, eq, ilike, isNull, or, sql } from "@raypx/database";
import { CreateUserSchema, user as User } from "@raypx/database/schemas";
import { deleteUserFiles, isR2Configured } from "@raypx/storage";
import { z } from "zod/v4";
import { Errors } from "../errors";
import { logger } from "../logger";
import { adminProcedure, protectedProcedure, publicProcedure } from "../trpc";
import { assertExists, assertOwnership, handleDatabaseError } from "../utils/error-handler";

/**
 * Users router - handles all user-related operations
 * All types are inferred from the tRPC context and input schemas
 */
export const usersRouter = {
  /**
   * List users with search, pagination, and status filters
   * Admin-only endpoint
   */
  list: adminProcedure
    .input(
      z
        .object({
          q: z.string().trim().min(1).max(200).optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(10),
          status: z.enum(["all", "active", "banned"]).default("all"),
          sortBy: z.enum(["createdAt", "email", "name"]).default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
        })
        .partial()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const offset = (page - 1) * pageSize;
      const conditions = [];

      if (input.q) {
        const like = `%${input.q}%`;
        conditions.push(or(ilike(User.name, like), ilike(User.email, like)));
      }
      if (input.status === "banned") {
        conditions.push(eq(User.banned, true));
      } else if (input.status === "active") {
        conditions.push(or(eq(User.banned, false), isNull(User.banned)));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const sortByCol =
        input.sortBy === "email"
          ? User.email
          : input.sortBy === "name"
            ? User.name
            : User.createdAt;
      const orderBy = input.sortOrder === "desc" ? desc(sortByCol) : sortByCol;

      const [items, totalRow] = await Promise.all([
        ctx.db.query.user.findMany({
          where,
          orderBy,
          limit: pageSize,
          offset,
        }),
        ctx.db
          .select({ value: sql<number>`count(*)::int` })
          .from(User)
          .where(where as any)
          .then((r) => r[0]),
      ]);

      const total = totalRow?.value ?? 0;
      return {
        items,
        total,
        page,
        pageSize,
      };
    }),

  /**
   * Get a single user by ID
   * Public endpoint - no authentication required
   * @throws {NOT_FOUND} If user with given ID does not exist
   */
  byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const user = await ctx.db.query.user.findFirst({
      where: eq(User.id, input.id),
    });

    // Assert user exists, throw NOT_FOUND if null
    assertExists(user, () => Errors.userNotFound(input.id));

    return user;
  }),

  /**
   * Update a user's role
   * Admin-only endpoint
   */
  updateRole: adminProcedure
    .input(
      z.object({
        id: z.string(),
        role: z.union([z.enum(["user", "admin", "superadmin"]), z.null()]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.user.findFirst({
        where: eq(User.id, input.id),
      });
      assertExists(existing, () => Errors.userNotFound(input.id));

      const [updated] = await ctx.db
        .update(User)
        .set({ role: input.role })
        .where(eq(User.id, input.id))
        .returning();
      return updated;
    }),

  /**
   * Ban or unban a user (with optional reason/expiry)
   * Admin-only endpoint
   */
  setBanned: adminProcedure
    .input(
      z.object({
        id: z.string(),
        banned: z.boolean(),
        banReason: z.string().max(500).optional(),
        banExpires: z
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
      const existing = await ctx.db.query.user.findFirst({
        where: eq(User.id, input.id),
      });
      assertExists(existing, () => Errors.userNotFound(input.id));

      const [updated] = await ctx.db
        .update(User)
        .set({
          banned: input.banned,
          banReason: input.banReason,
          banExpires: input.banExpires ?? null,
        })
        .where(eq(User.id, input.id))
        .returning();
      return updated;
    }),

  /**
   * Create a new user
   * Protected endpoint - requires authentication
   * @throws {BAD_REQUEST} If user already exists (duplicate email)
   * @throws {INTERNAL_SERVER_ERROR} If database operation fails
   */
  create: protectedProcedure.input(CreateUserSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await ctx.db.insert(User).values(input).returning();
      return result[0];
    } catch (error) {
      // Handle database errors (e.g., unique constraint violations)
      throw handleDatabaseError(error, "create user");
    }
  }),

  /**
   * Delete a user by ID
   * Protected endpoint - requires authentication
   * Users can only delete their own account unless they are an admin
   * Also deletes all R2 files belonging to the user
   * @throws {NOT_FOUND} If user with given ID does not exist
   * @throws {FORBIDDEN} If user tries to delete another user's account
   */
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    // First, check if user exists
    const userToDelete = await ctx.db.query.user.findFirst({
      where: eq(User.id, input),
    });

    assertExists(userToDelete, () => Errors.userNotFound(input));

    // Check if user has permission to delete
    // Users can only delete their own account
    assertOwnership(ctx.session.user.id, userToDelete.id, "User", input);

    try {
      // Delete all R2 files belonging to this user before deleting the user
      // This ensures we can still access user data if needed for cleanup
      if (isR2Configured()) {
        try {
          // Pass user's avatar URL if available to delete avatar file
          const avatarUrl = userToDelete.image;
          const result = await deleteUserFiles(input, avatarUrl);
          logger.info(
            `Deleted ${result.deleted} R2 files for user ${input}, ${result.failed} failed`,
          );
        } catch (r2Error) {
          // Log error but don't fail user deletion if R2 deletion fails
          // R2 files can be cleaned up later if needed
          logger.error(`Failed to delete R2 files for user ${input}:`, r2Error);
        }
      }

      // Delete user from database (cascade will handle related records like documents, datasets, etc.)
      await ctx.db.delete(User).where(eq(User.id, input));

      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete user");
    }
  }),

  /**
   * Update user profile
   * Protected endpoint - users can only update their own profile
   * @throws {NOT_FOUND} If user does not exist
   * @throws {FORBIDDEN} If user tries to update another user's profile
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255).optional(),
        username: z.string().trim().min(1).max(50).optional().nullable(),
        displayUsername: z.string().trim().max(50).optional().nullable(),
        image: z
          .string()
          .refine(
            (val) => {
              if (!val) return true; // Allow null/empty
              // Allow URLs
              try {
                new URL(val);
                return true;
              } catch {
                // Allow base64 data URIs (data:image/...;base64,...)
                return val.startsWith("data:image/") && val.includes("base64,");
              }
            },
            {
              message: "Image must be a valid URL or base64 data URI",
            },
          )
          .optional()
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if user exists
      const existing = await ctx.db.query.user.findFirst({
        where: eq(User.id, userId),
      });
      assertExists(existing, () => Errors.userNotFound(userId));

      // Build update object with only provided fields
      const updateData: {
        name?: string;
        username?: string | null;
        displayUsername?: string | null;
        image?: string | null;
      } = {};

      if (input.name !== undefined) {
        updateData.name = input.name;
      }
      if (input.username !== undefined) {
        updateData.username = input.username;
      }
      if (input.displayUsername !== undefined) {
        updateData.displayUsername = input.displayUsername;
      }
      if (input.image !== undefined) {
        updateData.image = input.image;
      }

      try {
        const [updated] = await ctx.db
          .update(User)
          .set(updateData)
          .where(eq(User.id, userId))
          .returning();
        return updated;
      } catch (error) {
        throw handleDatabaseError(error, "update profile");
      }
    }),

  /**
   * Change user password
   * Protected endpoint - users can only change their own password
   * @throws {BAD_REQUEST} If current password is incorrect
   * @throws {BAD_REQUEST} If new password doesn't meet requirements
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z
          .string()
          .min(8, "Password must be at least 8 characters")
          .max(128, "Password must be less than 128 characters"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const _userId = ctx.session.user.id;

      try {
        // Use Better Auth API to change password
        // This will validate the current password and update it
        const result = await auth.api.changePassword({
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          },
          headers: ctx.headers,
        });

        if (!result || "error" in result) {
          const errorMessage =
            result && typeof result === "object" && "error" in result && result.error
              ? typeof result.error === "object" && "message" in result.error
                ? String(result.error.message)
                : "Invalid current password or password requirements not met"
              : "Invalid current password or password requirements not met";
          throw Errors.businessRuleViolation("Password change failed", errorMessage);
        }

        return { success: true };
      } catch (error) {
        // If it's already a TRPCError, re-throw it
        if (error instanceof Error && "code" in error) {
          throw error;
        }

        // Handle Better Auth errors
        throw Errors.businessRuleViolation(
          "Password change failed",
          error instanceof Error ? error.message : "Unknown error occurred",
        );
      }
    }),
};
