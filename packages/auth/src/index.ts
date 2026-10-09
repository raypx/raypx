import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDatabase } from "@raypx/db";
import { createLogger } from "@raypx/logger";
import type { ApiErrorResponse } from "@raypx/contracts/errors";

const logger = createLogger({ name: "auth" });

/**
 * Authentication configuration using Better Auth
 *
 * Provides email/password authentication with session management
 *
 * @example
 * ```typescript
 * import { auth } from '@raypx/auth';
 *
 * // In API route
 * export async function POST({ request }) {
 *   return auth.handler(request);
 * }
 * ```
 */
export const auth = betterAuth({
  database: drizzleAdapter(getDatabase(), {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60, // 1 hour
    },
  },
  logger: {
    level: process.env.NODE_ENV === "production" ? "error" : "debug",
    disabled: false,
  },
  onAPIError: {
    onError: (error) => {
      logger.error({ error }, "Authentication error");
    },
  },
});

/**
 * Get current session from request
 *
 * @param request - HTTP request
 * @returns Session object or null
 *
 * @example
 * ```typescript
 * import { getSession } from '@raypx/auth';
 *
 * const session = await getSession(request);
 * if (!session) {
 *   return Response.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * ```
 */
export async function getSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
}

/**
 * Require authentication middleware
 *
 * @param request - HTTP request
 * @returns Session or unauthorized response
 *
 * @example
 * ```typescript
 * import { requireAuth } from '@raypx/auth';
 *
 * export async function GET({ request }) {
 *   const session = await requireAuth(request);
 *   if (session instanceof Response) return session;
 *
 *   // User is authenticated
 *   return Response.json({ user: session.user });
 * }
 * ```
 */
export async function requireAuth(
  request: Request,
): Promise<NonNullable<Awaited<ReturnType<typeof getSession>>> | Response> {
  const session = await getSession(request);

  if (!session) {
    logger.warn("Unauthorized access attempt");
    const requestId = request.headers.get("x-request-id");
    return Response.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          ...(requestId && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId) ? { requestId } : {}),
        },
      } satisfies ApiErrorResponse,
      { status: 401 },
    );
  }

  return session;
}

// Re-export Better Auth types
export type { Session, User } from "better-auth/types";
