import { desc, eq } from "@raypx/db";
import { CreateUserSchema, user as User } from "@raypx/db/schemas";
import { z } from "zod/v4";

import { protectedProcedure, publicProcedure } from "../trpc";

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
   */
  byId: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    return ctx.db.query.user.findFirst({
      where: eq(User.id, input.id),
    });
  }),

  /**
   * Create a new user
   * Protected endpoint - requires authentication
   */
  create: protectedProcedure.input(CreateUserSchema).mutation(({ ctx, input }) => {
    return ctx.db.insert(User).values(input);
  }),

  /**
   * Delete a user by ID
   * Protected endpoint - requires authentication
   */
  delete: protectedProcedure.input(z.string()).mutation(({ ctx, input }) => {
    return ctx.db.delete(User).where(eq(User.id, input));
  }),
};
