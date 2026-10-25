import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { matchLocale, parseAcceptLanguage } from "@raypx/i18n";
import type { Locale } from "@raypx/i18n/types";
import type { AuthSession, AuthUser } from "./types.js";

export interface AuthMailInput {
  email: string;
  name?: string | null;
  url: string;
  locale?: Locale;
  siteName?: string;
}
export interface AuthMailer {
  sendVerification(input: AuthMailInput): Promise<void>;
  sendPasswordReset(input: AuthMailInput): Promise<void>;
}
export interface AuthConfiguration {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  production: boolean;
  /** Parent domain shared by separately hosted Web and API, e.g. "example.com". */
  cookieDomain?: string;
  /** Headers set by the trusted edge that carry the client IP, in priority order. */
  ipAddressHeaders?: string[];
  /** Proxy addresses/CIDRs skipped from the right of a forwarded-for chain. */
  trustedProxies?: string[];
}
export type AuthSecondaryStorage = NonNullable<BetterAuthOptions["secondaryStorage"]>;
export interface CreateAuthOptions {
  database: NonNullable<BetterAuthOptions["database"]>;
  mailer: AuthMailer;
  config: AuthConfiguration;
  /** Optional shared cache for sessions and rate limits; the database remains the record. */
  secondaryStorage?: AuthSecondaryStorage;
  /** Checked when any sign-in method is about to create a user. Rejects while it fails. */
  registrationAllowed?: () => Promise<boolean>;
  /** Display name for authentication mail; resolve to a fallback rather than throwing. */
  siteName?: () => Promise<string>;
}
export function recipientLocale(request?: Request): { locale?: Locale } {
  const locale = matchLocale(
    parseAcceptLanguage(request?.headers.get("accept-language")).map((item) => item.locale),
  );
  return locale === undefined ? {} : { locale };
}
export function createAuth({
  database,
  mailer,
  config,
  secondaryStorage,
  registrationAllowed,
  siteName,
}: CreateAuthOptions) {
  const mailSite = async () => (siteName ? { siteName: await siteName() } : {});
  const origins = [...new Set([new URL(config.baseURL).origin, ...config.trustedOrigins])];
  const name = (value: string) => {
    const result = value.trim();
    if (!result || result.length > 80)
      throw new APIError("BAD_REQUEST", { code: "INVALID_NAME", message: "Invalid display name" });
    return result;
  };
  if (config.secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  if (config.production && new URL(config.baseURL).protocol !== "https:")
    throw new Error("Production AUTH_URL must use HTTPS");
  return betterAuth({
    appName: "Raypx",
    database,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: origins,
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          [
            "/update-user",
            "/revoke-session",
            "/revoke-other-sessions",
            "/revoke-sessions",
          ].includes(ctx.path)
        ) {
          const origin = ctx.headers?.get("origin");
          if (!origin || !origins.includes(origin))
            throw new APIError("FORBIDDEN", {
              code: "INVALID_ORIGIN",
              message: "Untrusted origin",
            });
        }
      }),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) =>
        mailer.sendPasswordReset({
          email: user.email,
          name: user.name,
          url,
          ...recipientLocale(request),
          ...(await mailSite()),
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
          ...(await mailSite()),
        }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (registrationAllowed && !(await registrationAllowed()))
              throw new APIError("BAD_REQUEST", {
                code: "REGISTRATION_DISABLED",
                message: "Registration is closed",
              });
            return { data: { ...user, name: name(user.name) } };
          },
        },
        update: {
          before: async (user) =>
            user.name === undefined ? undefined : { data: { ...user, name: name(user.name) } },
        },
      },
    },
    session: { storeSessionInDatabase: true, freshAge: 0 },
    // Shared storage keeps limits consistent across Node processes and Worker isolates.
    // Better Auth applies stricter built-in rules to sign-in, sign-up and mail requests.
    rateLimit: {
      enabled: config.production,
      storage: secondaryStorage ? "secondary-storage" : "database",
      window: 60,
      max: 100,
    },
    // Sessions and verifications are also written to the database, so a flushed or
    // restarted cache loses nothing; control projections keep reading the database.
    ...(secondaryStorage ? { secondaryStorage } : {}),
    verification: { storeInDatabase: true },
    advanced: {
      database: { generateId: () => crypto.randomUUID(), joins: false },
      ipAddress: {
        ...(config.ipAddressHeaders?.length ? { ipAddressHeaders: config.ipAddressHeaders } : {}),
        ...(config.trustedProxies?.length ? { trustedProxies: config.trustedProxies } : {}),
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: config.production ? "none" : "lax",
        secure: config.production,
      },
      // Web server rendering forwards the session, so it must see the cookie.
      ...(config.cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: config.cookieDomain } }
        : {}),
    },
  });
}
export type Auth = ReturnType<typeof createAuth>;
export function projectAuthUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    typeof v.email !== "string" ||
    typeof v.name !== "string" ||
    typeof v.emailVerified !== "boolean"
  )
    return null;
  return {
    id: v.id,
    email: v.email,
    name: v.name,
    emailVerified: v.emailVerified,
    ...(typeof v.image === "string" || v.image === null ? { image: v.image } : {}),
  };
}
/** A fresh database account needs no retired role/status fields to authenticate. */
export async function readAuthSession(
  auth: Pick<Auth, "api">,
  headers: Headers,
): Promise<AuthSession | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;
  const user = projectAuthUser(result.user);
  if (!user) return null;
  return {
    user,
    session: {
      id: result.session.id,
      userId: result.session.userId,
      expiresAt: result.session.expiresAt,
    },
  };
}
