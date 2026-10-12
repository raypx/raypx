import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { DatabaseConnection } from "@voidmix/db";
import { authAccounts, authSessions, authVerifications, users } from "@voidmix/db/schema";
import type { AuthSettings } from "@voidmix/core";
import { resolveRequestLocaleHint } from "@voidmix/i18n/server";
import type { Locale } from "@voidmix/i18n/types";
import { logger } from "@voidmix/shared/logger";
import type { Mailer } from "@voidmix/mail/types";
import { v7 as uuidv7 } from "uuid";
import { betterAuth } from "better-auth";

import type { ApiRuntimeEnvironment } from "../env.js";

/**
 * Better Auth hands each mail callback the request that triggered it, so the
 * recipient's own language is available without storing a preference. Absent a
 * request the property is omitted rather than set to undefined, so the mailer
 * falls back to `MAIL_DEFAULT_LOCALE` (`exactOptionalPropertyTypes` is on).
 */
export function recipientLocale(request: Request | undefined): { locale?: Locale } {
  if (!request) return {};
  const locale = resolveRequestLocaleHint(request.headers);
  return locale ? { locale } : {};
}

export interface CreateApiAuthOptions {
  connection: DatabaseConnection;
  environment: ApiRuntimeEnvironment;
  mailer: Mailer;
  getAuthSettings: () => Promise<AuthSettings>;
}

export function createApiAuth({
  connection,
  environment,
  mailer,
  getAuthSettings,
}: CreateApiAuthOptions) {
  const production = environment.NODE_ENV === "production";
  if (production && environment.AUTH_SECRET === "voidmix-development-secret-change-me") {
    throw new Error("AUTH_SECRET must be explicitly configured in production.");
  }
  if (production && environment.AUTH_URL.startsWith("http://localhost")) {
    throw new Error("AUTH_URL must be explicitly configured in production.");
  }
  const auth = betterAuth({
    database: drizzleAdapter(connection.db, {
      provider: "pg",
      schema: { users, authSessions, authAccounts, authVerifications },
    }),
    baseURL: environment.AUTH_URL,
    basePath: "/api/auth",
    secret: environment.AUTH_SECRET,
    trustedOrigins: [...new Set([...environment.ALLOWED_ORIGINS, environment.AUTH_URL])],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }, request) =>
        mailer.sendPasswordReset({
          email: user.email,
          name: user.name,
          url,
          ...recipientLocale(request),
        }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }, request) =>
        mailer.sendVerification({
          email: user.email,
          name: user.name,
          url,
          ...recipientLocale(request),
        }),
      afterEmailVerification: async (user, request) =>
        sendWelcomeEmailIfEnabled({
          user: { email: user.email, name: user.name },
          mailer,
          getAuthSettings,
          ...recipientLocale(request),
        }),
    },
    user: {
      modelName: "users",
      fields: { name: "displayName" },
      additionalFields: {
        role: { type: "string", required: false, input: false },
        status: { type: "string", required: false, input: false },
      },
    },
    // Database authority keeps both session reads and revocation available
    // during Redis outages, without a recovered cache reviving old tokens.
    session: { modelName: "authSessions", storeSessionInDatabase: true },
    account: { modelName: "authAccounts" },
    verification: { modelName: "authVerifications", storeInDatabase: true },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            const [existing] = await connection.db.select({ id: users.id }).from(users).limit(1);
            return {
              data: {
                ...data,
                role: existing ? "user" : "owner",
                status: "active",
              },
            };
          },
        },
      },
    },
    advanced: {
      database: { generateId: () => uuidv7(), joins: false },
      defaultCookieAttributes: {
        httpOnly: true,
        // Cross-origin Web and API are sibling subdomains in production.
        sameSite: production ? "none" : "lax",
        secure: production,
        ...(environment.AUTH_DOMAIN ? { domain: environment.AUTH_DOMAIN } : {}),
      },
    },
  });

  return auth;
}

export async function sendWelcomeEmailIfEnabled(options: {
  user: { email: string; name: string };
  mailer: Mailer;
  getAuthSettings: () => Promise<AuthSettings>;
  locale?: Locale;
}): Promise<void> {
  if (!(await options.getAuthSettings()).welcomeEmailEnabled) return;
  try {
    await options.mailer.sendWelcome({
      ...options.user,
      ...(options.locale ? { locale: options.locale } : {}),
    });
  } catch {
    const log = logger({ operation: "auth.welcome-email" });
    log.set({ recipient: options.user.email, outcome: "failure" });
    log.warn("Welcome email delivery failed after verification");
  }
}

export type ApiAuth = ReturnType<typeof createApiAuth>;
