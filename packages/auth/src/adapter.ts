import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { RaypxDatabase } from "@raypx/db";
import { schema } from "@raypx/db/schema";
import { createLogger } from "@raypx/logger";
import {
  parseOrigin,
  validateRedirectFields,
  validateRedirectParameters,
  validateRequestRedirects,
} from "./validation.js";

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
