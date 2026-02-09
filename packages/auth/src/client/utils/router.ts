/**
 * Router utilities for authentication routes
 * Provides server-side session checking for TanStack Router beforeLoad hooks
 */

import { redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import type { Session } from "../../server/auth";

export const createAuthServerSession = createIsomorphicFn()
  .server(async () => {
    const { auth } = await import("../../server/auth");
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({
      headers,
    });
    return !!session?.session;
  })
  .client(async () => {
    const { auth } = await import("../../client/auth");
    const { data: session } = await auth.getSession();
    return !!session?.session;
  });

export type { Session };

export function createAuthRouteBeforeLoad(redirectTo = "/dashboard") {
  return async (context: { location: { search: Record<string, unknown> } }) => {
    const session = await createAuthServerSession();
    if (!session) {
      throw redirect({
        to: redirectTo,
        search: context.location.search,
        replace: true,
      });
    }
  };
}

export function createProtectedRouteBeforeLoad(redirectTo = "/sign-in") {
  return async (context: { location: { search: Record<string, unknown> } }) => {
    // Only check on server side
    if (typeof window === "undefined") {
      const session = await createAuthServerSession();
      if (!session) {
        throw redirect({
          to: redirectTo,
          search: context.location.search,
          replace: true,
        });
      }
    }
  };
}
