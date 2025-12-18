/**
 * RBAC Middleware for tRPC Procedures
 *
 * Provides reusable middleware for permission checking
 */

import type { statement, UserRole } from "@raypx/auth";
import { TRPCError } from "@trpc/server";
import { middleware } from "../trpc";
import { checkPermission, hasAnyRole } from "../utils/rbac";

/**
 * Create middleware that checks if user has permission for a resource and action
 */
export function requirePermission(
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const userId = ctx.session.user.id;
    const hasAccess = await checkPermission(userId, resource, action);

    if (!hasAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Insufficient permissions to ${action} ${resource}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
      },
    });
  });
}

/**
 * Create middleware that checks if user has one of the specified roles
 */
export function requireRole(...roles: UserRole[]) {
  return middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const userId = ctx.session.user.id;
    const hasAccess = await hasAnyRole(userId, roles);

    if (!hasAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Access denied. Required roles: ${roles.join(", ")}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
      },
    });
  });
}

/**
 * Create middleware that checks resource ownership or permission
 *
 * @param resource - Resource type for permission check
 * @param action - Action for permission check
 * @param getResourceUserId - Function to get the resource owner's userId from input
 */
export function requireOwnershipOrPermission<TInput = unknown>(
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
  getResourceUserId: (input: TInput) => string | null | Promise<string | null>,
) {
  return middleware(async ({ ctx, input, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const userId = ctx.session.user.id;
    const resourceUserId = await getResourceUserId(input as TInput);

    // Owner can always access
    if (resourceUserId === userId) {
      return next({
        ctx: {
          ...ctx,
          session: ctx.session,
        },
      });
    }

    // Check permission
    const hasAccess = await checkPermission(userId, resource, action);
    if (!hasAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Insufficient permissions to ${action} ${resource}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
      },
    });
  });
}
