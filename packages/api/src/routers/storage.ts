import { eq } from "@raypx/database";
import { user as User } from "@raypx/database/schemas";

import { protectedProcedure } from "../middleware";

/**
 * Storage router - handles file uploads and management
 */
export const storageRouter = {
  /**
   * Delete avatar (set to null)
   * Note: This doesn't delete the file from R2, just removes the reference
   */
  deleteAvatar: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session.user.id;

    await context.db
      .update(User)
      .set({
        image: null,
        updatedAt: new Date(),
      })
      .where(eq(User.id, userId));

    return { success: true };
  }),
};
