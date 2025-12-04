/**
 * Router utilities for authentication routes
 * Provides server-side session checking for TanStack Router beforeLoad hooks
 */

import { redirect } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

/**
 * Server-only function to get session from request headers
 * Use this in TanStack Router beforeLoad hooks for authentication checks
 *
 * @example
 * ```ts
 * const getSession = createAuthServerSession();
 *
 * export const Route = createFileRoute("/sign-in")({
 *   beforeLoad: async () => {
 *     const session = await getSession();
 *     if (session?.user) {
 *       throw redirect({ to: "/dashboard" });
 *     }
 *   },
 * });
 * ```
 */
export function createAuthServerSession() {
  return createServerOnlyFn(async () => {
    const { auth } = await import("../../server/auth");
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({
      headers,
    });
    return session;
  });
}

/**
 * Create a beforeLoad hook for auth routes that redirects authenticated users
 * Use this in route configuration: beforeLoad: createAuthRouteBeforeLoad("/dashboard")
 *
 * @param redirectTo - Redirect path for authenticated users (defaults to "/dashboard")
 * @returns beforeLoad hook function
 *
 * @example
 * ```ts
 * export const Route = createFileRoute("/sign-in")({
 *   beforeLoad: createAuthRouteBeforeLoad("/dashboard"),
 *   component: SignInPage,
 * });
 * ```
 */
export function createAuthRouteBeforeLoad(redirectTo = "/dashboard") {
  const getServerSession = typeof window === "undefined" ? createAuthServerSession() : null;

  return async (context: { location: { search: Record<string, unknown> } }) => {
    // Only check on server side
    if (typeof window === "undefined" && getServerSession) {
      const session = await getServerSession();
      if (session?.user) {
        throw redirect({
          to: redirectTo,
          search: context.location.search,
          replace: true,
        });
      }
    }
  };
}

/**
 * Create a beforeLoad hook for protected routes that redirects unauthenticated users
 * Use this in route configuration: beforeLoad: createProtectedRouteBeforeLoad("/sign-in")
 *
 * @param redirectTo - Redirect path for unauthenticated users (defaults to "/sign-in")
 * @returns beforeLoad hook function
 *
 * @example
 * ```ts
 * export const Route = createFileRoute("/dashboard")({
 *   beforeLoad: createProtectedRouteBeforeLoad("/sign-in"),
 *   component: DashboardPage,
 * });
 * ```
 */
export function createProtectedRouteBeforeLoad(redirectTo = "/sign-in") {
  const getServerSession = typeof window === "undefined" ? createAuthServerSession() : null;

  return async (context: { location: { search: Record<string, unknown> } }) => {
    // Only check on server side
    if (typeof window === "undefined" && getServerSession) {
      const session = await getServerSession();
      if (!session?.user) {
        throw redirect({
          to: redirectTo,
          search: context.location.search,
          replace: true,
        });
      }
    }
  };
}
