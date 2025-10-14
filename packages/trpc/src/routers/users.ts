import { getDatabase, schemas } from "@raypx/db";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { publicProcedure } from "../init";

const DEFAULT_LIMIT = 100;

/**
 * Users router exposing read-only user queries.
 */
export const usersRouter = {
  list: publicProcedure.query(async () => {
    const db = await getDatabase();

    try {
      const users = await db
        .select({
          id: schemas.user.id,
          name: schemas.user.name,
          email: schemas.user.email,
          role: schemas.user.role,
          createdAt: schemas.user.createdAt,
          banned: schemas.user.banned,
          banReason: schemas.user.banReason,
        })
        .from(schemas.user)
        .limit(DEFAULT_LIMIT);

      return users;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to fetch the user list.",
        cause: error,
      });
    }
  }),
} satisfies TRPCRouterRecord;
