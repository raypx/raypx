import { createLogger } from "@raypx/logger";
import type { ApiErrorResponse } from "@raypx/contracts/errors";
import type { AuthInstance, AuthSession } from "./adapter.js";

const logger = createLogger({ name: "auth" });

/**
 * Global auth instance storage
 */
let globalAuthInstance: AuthInstance | undefined;

/**
 * Configure global auth instance
 *
 * @param instance - Auth instance to use globally
 *
 * @example
 * ```typescript
 * import { createAuth, configureAuth } from '@raypx/auth';
 *
 * const auth = createAuth({ ... });
 * configureAuth(auth);
 * ```
 */
export function configureAuth(instance: AuthInstance | undefined): void {
  globalAuthInstance = instance;
}

/**
 * Get global auth instance
 *
 * @returns Auth instance
 * @throws Error if auth is not configured
 */
export function getAuth(): AuthInstance {
  if (!globalAuthInstance) {
    throw new Error(
      "Auth is not configured. Call configureAuth() first or pass an explicit instance.",
    );
  }
  return globalAuthInstance;
}

/**
 * Global auth instance proxy
 *
 * Allows using auth without explicit getAuth() calls
 */
export const auth: AuthInstance = new Proxy({} as AuthInstance, {
  get(_target, prop) {
    return Reflect.get(getAuth(), prop);
  },
});

/**
 * Get session from request
 *
 * @param request - HTTP request
 * @param instance - Auth instance (defaults to global)
 * @returns Session if authenticated, null otherwise
 *
 * @example
 * ```typescript
 * import { getSession } from '@raypx/auth';
 *
 * export async function GET({ request }) {
 *   const session = await getSession(request);
 *   if (!session) {
 *     return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *   }
 *   return Response.json({ user: session.user });
 * }
 * ```
 */
export async function getSession(request: Request, instance: AuthInstance = getAuth()) {
  const session = await instance.api.getSession({ headers: request.headers });
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
  instance: AuthInstance = getAuth(),
): Promise<AuthSession | Response> {
  const session = await getSession(request, instance);

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
