import { desc, eq } from "@raypx/db";
import { CreateUserSchema, user as User } from "@raypx/db/schemas";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure, publicProcedure } from "../trpc";
import { assertExists, assertOwnership, handleDatabaseError } from "../utils/error-handler";

/**
 * Users router - handles all user-related operations
 * All types are inferred from the tRPC context and input schemas
 */
export const usersRouter = {
  /**
   * Get all users (limited to 10)
   * Public endpoint - no authentication required
   */
  all: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.user.findMany({
      orderBy: desc(User.id),
      limit: 10,
    });
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
      await ctx.db.delete(User).where(eq(User.id, input));
      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete user");
    }
  }),
};
