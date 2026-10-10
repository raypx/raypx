import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { RaypxDatabase } from "@raypx/db";
import { schema } from "@raypx/db/schema";
import { createLogger } from "@raypx/logger";
import type { ApiErrorResponse } from "@raypx/contracts/errors";

const logger = createLogger({ name: "auth" });

export interface CreateAuthOptions {
  /** Explicitly created, migrated SQLite database owned by the application. */
  database: RaypxDatabase;
  /** At least 32 characters. Supply a cryptographically random secret. */
  secret: string;
  /** Application HTTP(S) origin, without credentials, path, query, or fragment. */
  baseURL: string;
  environment?: "development" | "production" | "test";
  /** Additional exact HTTP(S) origins allowed to call authentication endpoints. */
  trustedOrigins?: string[];
}

function parseOrigin(input: string, field: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Auth ${field} must be a valid HTTP(S) origin`);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (production && url.protocol !== "https:")
  )
    throw new Error(
      `Auth ${field} must be an HTTP(S) origin${production ? " using HTTPS in production" : ""}`,
    );
  return url.origin;
}

const redirectFields = [
  "callbackURL",
  "errorCallbackURL",
  "newUserCallbackURL",
  "redirectTo",
] as const;

function invalidRedirect(): APIError {
  return new APIError("FORBIDDEN", {
    code: "INVALID_AUTH_REDIRECT",
    message: "Invalid authentication redirect",
  });
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function validateRedirect(value: unknown, allowedOrigins: ReadonlySet<string>): void {
  if (value === undefined) return;
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    hasControlCharacters(value) ||
    value.includes("\\") ||
    value.startsWith("//")
  )
    throw invalidRedirect();
  if (value.startsWith("/")) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidRedirect();
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    !allowedOrigins.has(url.origin)
  )
    throw invalidRedirect();
}

function validateRedirectFields(input: unknown, allowedOrigins: ReadonlySet<string>): void {
  if (!input || typeof input !== "object") return;
  for (const field of redirectFields) {
    const value: unknown = Reflect.get(input, field);
    validateRedirect(value, allowedOrigins);
  }
}

function validateRedirectParameters(
  input: URLSearchParams,
  allowedOrigins: ReadonlySet<string>,
): void {
  for (const field of redirectFields) {
    const values = input.getAll(field);
    if (values.length > 1) throw invalidRedirect();
    for (const value of values) validateRedirect(value, allowedOrigins);
  }
}

async function validateRequestRedirects(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): Promise<void> {
  validateRedirectParameters(new URL(request.url).searchParams, allowedOrigins);
  if (!request.body) return;
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType === "application/json") {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      return;
    } // Better Auth owns malformed JSON validation.
    validateRedirectFields(body, allowedOrigins);
  } else if (mediaType === "application/x-www-form-urlencoded") {
    validateRedirectParameters(new URLSearchParams(await request.clone().text()), allowedOrigins);
  }
}

/**
 * Creates email/password authentication for an explicitly owned SQLite database.
 *
 * This factory reads no process environment, opens no database, and runs no
 * migrations. The caller supplies the secret and origin and owns the database's
 * lifecycle. Cookie caching is disabled so revocation is checked in SQLite.
 */
export function createAuth(options: CreateAuthOptions) {
  const environment = options.environment ?? "development";
  if (!["development", "production", "test"].includes(environment))
    throw new Error("Auth environment must be development, production, or test");
  if (typeof options.secret !== "string" || options.secret.trim().length < 32)
    throw new Error("Auth secret must contain at least 32 characters");
  const production = environment === "production";
  const baseURL = parseOrigin(options.baseURL, "baseURL", production);
  const trustedOrigins = [
    baseURL,
    ...(options.trustedOrigins ?? []).map((origin) =>
      parseOrigin(origin, "trustedOrigins", production),
    ),
  ];
  const allowedOrigins = new Set(trustedOrigins);

  const instance = betterAuth({
    database: drizzleAdapter(options.database, {
      provider: "sqlite",
      schema,
      // Better Auth callbacks are async; both SQLite drivers are synchronous.
      transaction: false,
    }),
    secret: options.secret,
    secrets: [{ version: 1, value: options.secret }],
    baseURL,
    basePath: "/api/auth",
    trustedOrigins,
    hooks: {
      before: createAuthMiddleware(async (context) => {
        validateRedirectFields(context.body, allowedOrigins);
        validateRedirectFields(context.query, allowedOrigins);
        if (context.request) {
          validateRedirectParameters(new URL(context.request.url).searchParams, allowedOrigins);
        }
      }),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: production,
      disableOriginCheck: false,
      disableCSRFCheck: false,
      ipAddress: { ipAddressHeaders: [] },
    },
    // The route layer owns limiting with identities from a trusted transport.
    rateLimit: { enabled: false },
    logger: { disabled: true },
    onAPIError: {
      onError: (error) => {
        logger.error(
          { errorName: error instanceof Error ? error.name : "UnknownError" },
          "Authentication error",
        );
      },
    },
    telemetry: { enabled: false },
  });

  const handler = instance.handler;
  instance.handler = async (request) => {
    try {
      // The vendor's global origin middleware runs before endpoint hooks and
      // expects scalar redirect values. Preflight prevents malformed values
      // reaching it; the before hook also protects direct server API calls.
      await validateRequestRedirects(request, allowedOrigins);
    } catch (error) {
      if (!(error instanceof APIError)) throw error;
      return Response.json(
        { code: "INVALID_AUTH_REDIRECT", message: "Invalid authentication redirect" },
        { status: 403 },
      );
    }
    return handler(request);
  };
  return instance;
}

export type AuthInstance = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<AuthInstance["api"]["getSession"]>>>;

let configuredAuth: AuthInstance | undefined;

/** Sets or clears the explicit default used by compatibility session helpers. */
export function configureAuth(instance: AuthInstance | undefined): void {
  configuredAuth = instance;
}

/** Returns the configured default, failing without opening an implicit database. */
export function getAuth(): AuthInstance {
  if (!configuredAuth)
    throw new Error(
      "Authentication is not configured. Create an instance with createAuth and pass it explicitly or call configureAuth.",
    );
  return configuredAuth;
}

/**
 * Compatibility facade forwarding to the explicitly configured instance.
 * @deprecated Prefer the instance returned by `createAuth` or `getAuth()`.
 */
export const auth: AuthInstance = new Proxy({} as AuthInstance, {
  get(_target, property) {
    // Promise-like probing must not resolve the configured instance.
    if (property === "then") return undefined;
    return Reflect.get(getAuth(), property);
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

// Re-export Better Auth types
export type { Session, User } from "better-auth/types";
