import { db } from "@raypx/database";
import { z } from "zod/v4";
import { protectedProcedure } from "../index";

export const usersRouter = {
  count: protectedProcedure.handler(async () => {
    const count = await db.user.count();
    return count;
  }),

  stats: protectedProcedure.handler(async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const [total, newUsers] = await Promise.all([
      db.user.count(),
      db.user.count({
        where: {
          createdAt: {
            gte: lastMonth,
          },
        },
      }),
    ]);

    const change = total > 0 ? Math.round((newUsers / total) * 100) : 0;

    return {
      total,
      newUsers,
      change,
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
      const [users, total] = await Promise.all([
        db.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            emailVerified: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: input.limit,
          skip: input.offset,
        }),
        db.user.count(),
      ]);

      return {
        users,
        total,
      };
    }),

  infiniteList: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
        cursor: z.string().optional(),
      }),
    )
    .handler(async ({ input }) => {
      const { limit, cursor } = input;

      const users = await db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          emailVerified: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit + 1,
        ...(cursor && {
          skip: 1,
          cursor: {
            id: cursor,
          },
        }),
      });

      const hasNextPage = users.length > limit;
      const items = hasNextPage ? users.slice(0, limit) : users;
      const lastItem = items[items.length - 1];
      const nextCursor = hasNextPage && lastItem ? lastItem.id : undefined;

      return {
        users: items,
        nextCursor,
        hasNextPage,
      };
    }),

  revenue: protectedProcedure.handler(async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const [total, newUsers] = await Promise.all([
      db.user.count(),
      db.user.count({
        where: {
          createdAt: {
            gte: lastMonth,
          },
        },
      }),
    ]);

    // Simulate revenue: $50 per user average
    const currentRevenue = total * 50;
    const lastMonthRevenue = (total - newUsers) * 50;
    const change =
      lastMonthRevenue > 0
        ? Math.round(((currentRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
        : 0;

    return {
      current: currentRevenue,
      change: change > 0 ? `+${change}%` : `${change}%`,
    };
  }),

  activeSessions: protectedProcedure.handler(async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const [total, newUsers] = await Promise.all([
      db.user.count(),
      db.user.count({
        where: {
          createdAt: {
            gte: lastMonth,
          },
        },
      }),
    ]);

    // Simulate active sessions: ~40% of total users
    const currentSessions = Math.round(total * 0.4);
    const lastMonthSessions = Math.round((total - newUsers) * 0.4);
    const change =
      lastMonthSessions > 0
        ? Math.round(((currentSessions - lastMonthSessions) / lastMonthSessions) * 100)
        : 0;

    return {
      current: currentSessions,
      change: change > 0 ? `+${change}%` : `${change}%`,
    };
  }),

  conversionRate: protectedProcedure.handler(async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const [total, newUsers] = await Promise.all([
      db.user.count(),
      db.user.count({
        where: {
          createdAt: {
            gte: lastMonth,
          },
        },
      }),
    ]);

    // Simulate conversion rate: 2.5-4% range based on growth
    const baseRate = 2.5;
    const growthBonus = Math.min((newUsers / Math.max(total, 1)) * 10, 1.5);
    const currentRate = (baseRate + growthBonus).toFixed(1);
    const lastMonthRate = baseRate.toFixed(1);

    const current = Number.parseFloat(currentRate);
    const last = Number.parseFloat(lastMonthRate);
    const change = last > 0 ? Math.round(((current - last) / last) * 100) : 0;

    return {
      current: `${currentRate}%`,
      change: change > 0 ? `+${change}%` : `${change}%`,
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        image: z.string().url().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.session?.user?.id;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      const updatedUser = await db.user.update({
        where: { id: userId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.image !== undefined && { image: input.image }),
        },
      });

      return updatedUser;
    }),

  delete: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session?.user?.id;

    if (!userId) {
      throw new Error("User not authenticated");
    }

    await db.user.delete({
      where: { id: userId },
    });

    return { success: true };
  }),

  getById: protectedProcedure.input(z.object({ id: z.string() })).handler(async ({ input }) => {
    const user = await db.user.findUnique({
      where: { id: input.id },
    });

    return user;
  }),

  getAdminStats: protectedProcedure.handler(async ({ context }) => {
    const userId = context.session?.user?.id;

    if (!userId) {
      throw new Error("User not authenticated");
    }

    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!currentUser || currentUser.email?.endsWith("@admin.com")) {
      // Admin stats
      const totalUsers = await db.user.count();

      return {
        isAdmin: true,
        totalUsers,
        adminActions: ["delete", "update", "create"],
      };
    }

    // Non-admin users get limited stats
    return {
      isAdmin: false,
      adminActions: [],
    };
  }),
} as const;
