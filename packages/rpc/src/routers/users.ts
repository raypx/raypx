import { db } from "@raypx/database";
import { user } from "@raypx/database/schema/auth";
import { count, desc, gte } from "@raypx/database/sql";
import { z } from "zod/v4";
import { protectedProcedure } from "../index";

export const usersRouter = {
  count: protectedProcedure.handler(async () => {
    const result = await db.select({ count: count() }).from(user);
    return result[0]?.count ?? 0;
  }),

  stats: protectedProcedure.handler(async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const [totalResult, newUsersResult] = await Promise.all([
      db.select({ count: count() }).from(user),
      db.select({ count: count() }).from(user).where(gte(user.createdAt, lastMonth)),
    ]);

    const total = totalResult[0]?.count ?? 0;
    const newUsers = newUsersResult[0]?.count ?? 0;

    return {
      total,
      newUsers,
      change: total > 0 ? Math.round((newUsers / total) * 100) : 0,
    };
  }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        offset: z.number().min(0).default(0),
      }),
    )
    .handler(async ({ input }) => {
      const users = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(desc(user.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [totalResult] = await db.select({ count: count() }).from(user);

      return {
        users,
        total: totalResult?.count ?? 0,
      };
    }),
} as const;
