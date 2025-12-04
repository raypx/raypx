/**
 * RBAC Middleware for tRPC Procedures
 *
 * Provides reusable middleware for permission checking
 */

import type { statement, UserRole } from "@raypx/auth";
import { TRPCError } from "@trpc/server";
import type { MiddlewareFunction } from "@trpc/server/unstable-core-do-not-import";
import type { TRPCContext } from "../trpc";
import { checkPermission, getUserRole, hasAnyRole } from "../utils/rbac";

/**
 * Create middleware that checks if user has permission for a resource and action
 */
export function requirePermission<
  TContext extends TRPCContext,
  TInput = unknown,
  TOutput = unknown,
>(
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
): MiddlewareFunction<TContext, TInput, TOutput> {
  return async ({ ctx, next }) => {
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
  };
}

/**
 * Create middleware that checks if user has one of the specified roles
 */
export function requireRole<TContext extends TRPCContext, TInput = unknown, TOutput = unknown>(
  ...roles: UserRole[]
): MiddlewareFunction<TContext, TInput, TOutput> {
  return async ({ ctx, next }) => {
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
  };
}

/**
 * Create middleware that checks resource ownership or permission
 *
 * @param resource - Resource type for permission check
 * @param action - Action for permission check
 * @param getResourceUserId - Function to get the resource owner's userId from input
 */
export function requireOwnershipOrPermission<
  TContext extends TRPCContext,
  TInput = unknown,
  TOutput = unknown,
>(
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
  getResourceUserId: (input: TInput) => string | null | Promise<string | null>,
): MiddlewareFunction<TContext, TInput, TOutput> {
  return async ({ ctx, input, next }) => {
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
  };
}
