import { betterAuth, type BetterAuthOptions } from "better-auth";
import { matchLocale, parseAcceptLanguage } from "@raypx/i18n";
import type { Locale } from "@raypx/i18n/types";
import type { AuthSession, AuthUser } from "./types.js";

export interface AuthMailInput {
  email: string;
  name?: string | null;
  url: string;
  locale?: Locale;
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
}
export interface CreateAuthOptions {
  database: NonNullable<BetterAuthOptions["database"]>;
  mailer: AuthMailer;
  config: AuthConfiguration;
}
export function recipientLocale(request?: Request): { locale?: Locale } {
  const locale = matchLocale(
    parseAcceptLanguage(request?.headers.get("accept-language")).map((item) => item.locale),
  );
  return locale === undefined ? {} : { locale };
}
export function createAuth({ database, mailer, config }: CreateAuthOptions) {
  if (config.secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  if (config.production && new URL(config.baseURL).protocol !== "https:")
    throw new Error("Production AUTH_URL must use HTTPS");
  return betterAuth({
    appName: "Raypx",
    database,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [...new Set([config.baseURL, ...config.trustedOrigins])],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }, request) =>
        mailer.sendPasswordReset({
          email: user.email,
          name: user.name,
          url,
          ...recipientLocale(request),
        }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }, request) =>
        mailer.sendVerification({
          email: user.email,
          name: user.name,
          url,
          ...recipientLocale(request),
        }),
    },
    session: { storeSessionInDatabase: true },
    verification: { storeInDatabase: true },
    advanced: {
      database: { generateId: () => crypto.randomUUID(), joins: false },
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
