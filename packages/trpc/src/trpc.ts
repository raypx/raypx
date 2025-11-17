/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1)
 * 2. You want to create a new middleware or type of procedure (see Part 3)
 *
 * tl;dr - this is where all the tRPC server stuff is created and plugged in.
 * The pieces you will need to use are documented accordingly near the end
 */

import { auth, type Session } from "@raypx/auth/server";
import { db, eq, schemas } from "@raypx/db";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError, z } from "zod/v4";
import { errorLoggingMiddleware, performanceLoggingMiddleware } from "./middlewares/error-logger";

/**
 * Options for creating the tRPC context
 * These are the inputs required to build the request context
 */
export type CreateTRPCContextOptions = {
  /**
   * Request headers containing authentication and metadata
   */
  readonly headers: Headers;
};

/**
 * Creates the tRPC context for each request
 *
 * This function is called for every tRPC request and provides:
 * - Authentication API and session information
 * - Database instance for data access
 * - Request-specific metadata
 *
 * @param opts - Context creation options containing headers and auth instance
 * @returns Promise resolving to the context object with authApi, session, and db
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (
  opts: CreateTRPCContextOptions,
): Promise<{
  session: Session | null;
  db: typeof db;
  headers: Headers;
}> => {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });
  return {
    session,
    db,
    headers: opts.headers,
  };
};

/**
 * Inferred context type that's available in all tRPC procedures
 * This type includes:
 * - authApi: Better-auth API instance for authentication operations
 * - session: Current user session (may be null if not authenticated)
 * - db: Drizzle ORM database instance
 */
export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError:
        error.cause instanceof ZodError
          ? z.flattenError(error.cause as ZodError<Record<string, unknown>>)
          : null,
    },
  }),
});

export const createTRPCRouter = t.router;

/**
 * Middleware factory for creating custom middleware
 *
 * @see https://trpc.io/docs/server/middlewares
 */
export const middleware = t.middleware;

/**
 * Public (unauthed) procedure builder
 *
 * This is the base piece you use to build new queries and mutations on your
 * tRPC API. It does not guarantee that a user querying is authorized, but you
 * can still access user session data if they are logged in
 *
 * Includes automatic error logging and performance monitoring
 */
export const publicProcedure = t.procedure
  .use(errorLoggingMiddleware)
  .use(performanceLoggingMiddleware());

/**
 * Protected (authenticated) procedure builder
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * Includes automatic error logging and performance monitoring
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(errorLoggingMiddleware)
  .use(performanceLoggingMiddleware())
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Admin-only procedure builder
 *
 * Requires authentication and admin role (admin or superadmin).
 */
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const current = await db.query.user.findFirst({
    where: eq(schemas.user.id, ctx.session.user.id),
    columns: { role: true },
  });
  const role = current?.role;
  const isAdmin = role === "admin" || role === "superadmin";
  if (!isAdmin) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
