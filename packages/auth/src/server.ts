import { betterAuth, type BetterAuthOptions } from "better-auth";
import { oauthProvider } from "@better-auth/oauth-provider";
import { captcha } from "better-auth/plugins/captcha";
import { passkey } from "@better-auth/passkey";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { emailOTP } from "better-auth/plugins/email-otp";
import { twoFactor } from "better-auth/plugins/two-factor";
import { jwt } from "better-auth/plugins/jwt";
import { desktopLoginPaths, desktopOAuthClientId } from "@raypx/contracts/api";
import { admin } from "better-auth/plugins/admin";
import { accountAccessControl, accountRoles, assignedRoles } from "./access.js";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx,
} from "better-auth/api";
import { matchLocale, parseAcceptLanguage } from "@raypx/i18n";
import type { Locale } from "@raypx/i18n/types";
import {
  normalizeTrustedOrigins,
  type AuthSession,
  type AuthUser,
  type SocialProvider,
} from "@raypx/core/auth";
import { desktopLogin, desktopOAuthHash } from "./desktop-login.js";
import { authPolicy } from "./policy.js";

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
  sendSignInCode?(input: Omit<AuthMailInput, "url"> & { code: string }): Promise<void>;
}
export interface AuthConfiguration {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  production: boolean;
  passkeyRpId?: string;
  checkCompromisedPasswords?: boolean;
  turnstile?: { siteKey: string; secretKey: string };
  socialProviders?: Partial<Record<SocialProvider, { clientId: string; clientSecret: string }>>;
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
  /** A successful security revocation invalidates all hosts, or only the session's hosts. */
  revokeHostAuthorizations?: (userId: string, sessionId?: string) => Promise<void>;
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
  revokeHostAuthorizations,
}: CreateAuthOptions) {
  const mailSite = async () => (siteName ? { siteName: await siteName() } : {});
  const origins = normalizeTrustedOrigins([config.baseURL, ...config.trustedOrigins]);
  const name = (value: string) => {
    const result = value.trim();
    if (!result || result.length > authPolicy.nameMaxLength)
      throw new APIError("BAD_REQUEST", { code: "INVALID_NAME", message: "Invalid display name" });
    return result;
  };
  if (config.secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  if (config.production && new URL(config.baseURL).protocol !== "https:")
    throw new Error("Production AUTH_URL must use HTTPS");
  const issuer = new URL(config.baseURL).origin;
  const rpId = config.passkeyRpId ?? new URL(issuer).hostname;
  const passkeyOrigins = origins.filter((origin) => {
    const url = new URL(origin);
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost")) &&
      (url.hostname === rpId || url.hostname.endsWith(`.${rpId}`))
    );
  });
  const socialProviders = config.socialProviders ?? {};
  const turnstile =
    config.turnstile &&
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: config.turnstile.secretKey,
      endpoints: ["/email-otp/send-verification-otp"],
      allowedHostnames: origins
        .filter((origin) => /^https?:/.test(origin))
        .map((origin) => new URL(origin).hostname),
      expectedAction: "email-code",
    });
  const consent: Parameters<typeof desktopLogin>[2] = (headers, body) =>
    auth.api.oauth2Consent({ headers, body });
  const auth = betterAuth({
    appName: "Raypx",
    database,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    disabledPaths: [
      "/token",
      "/email-otp/verify-email",
      "/email-otp/request-password-reset",
      "/email-otp/reset-password",
      "/forget-password/email-otp",
    ],
    trustedOrigins: origins,
    socialProviders: {
      ...(config.socialProviders?.google
        ? { google: { ...config.socialProviders.google, requireEmailVerification: true } }
        : {}),
      ...(config.socialProviders?.github
        ? { github: { ...config.socialProviders.github, requireEmailVerification: true } }
        : {}),
    },
    // Link only identities whose email is verified by the provider; never trust a
    // provider name as a substitute for verification.
    account: { accountLinking: { enabled: true, trustedProviders: [] } },
    plugins: [
      twoFactor({ issuer: "Raypx" }),
      emailOTP({
        disableSignUp: true,
        storeOTP: "hashed",
        allowedAttempts: 3,
        async sendVerificationOTP({ email, otp, type }, ctx) {
          if (type !== "sign-in" || !mailer.sendSignInCode)
            throw new APIError("BAD_REQUEST", { message: "Unsupported verification" });
          const account = await ctx?.context.internalAdapter.findUserByEmail(email);
          if (account && "twoFactorEnabled" in account.user && account.user.twoFactorEnabled)
            return;
          await mailer.sendSignInCode({
            email,
            code: otp,
            ...recipientLocale(ctx?.request),
            ...(await mailSite()),
          });
        },
      }),
      passkey({
        rpID: rpId,
        rpName: "Raypx",
        origin: passkeyOrigins,
        authenticatorSelection: { userVerification: "required" },
      }),
      haveIBeenPwned({ enabled: config.checkCompromisedPasswords === true }),
      jwt({ jwt: { issuer, audience: desktopOAuthClientId }, disableSettingJwtHeader: true }),
      oauthProvider({
        loginPage: `${issuer}/api/auth${desktopLoginPaths.browser}`,
        consentPage: `${issuer}/api/auth${desktopLoginPaths.browser}`,
        scopes: ["openid"],
        grantTypes: ["authorization_code"],
        clientPrivileges: () => false,
        resourcePrivileges: () => false,
        allowDynamicClientRegistration: false,
        codeExpiresIn: 300,
        accessTokenExpiresIn: 60,
        idTokenExpiresIn: 60,
        storeTokens: { hash: desktopOAuthHash },
      }),
      desktopLogin(issuer, origins, consent),
      admin({ defaultRole: "member", ac: accountAccessControl, roles: accountRoles }),
      {
        id: "raypx-social-providers",
        ...(turnstile?.onRequest ? { onRequest: turnstile.onRequest } : {}),
        endpoints: {
          socialProviders: createAuthEndpoint("/social-providers", { method: "GET" }, async (ctx) =>
            ctx.json({
              providers: Object.keys(socialProviders),
              turnstileSiteKey: config.turnstile?.siteKey,
            }),
          ),
        },
      },
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ((ctx.request || ctx.headers) &&
            ctx.path.startsWith("/admin/") &&
            !["/admin/list-users", "/admin/get-user"].includes(ctx.path)) ||
          [
            "/two-factor/enable",
            "/two-factor/disable",
            "/two-factor/generate-backup-codes",
            "/two-factor/get-totp-uri",
            "/two-factor/verify-totp",
            "/two-factor/verify-backup-code",
            "/link-social",
            "/unlink-account",
            "/passkey/verify-registration",
            "/passkey/delete-passkey",
            "/update-user",
            "/change-password",
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
        if (ctx.path === "/two-factor/enable" && ctx.body?.method === "otp")
          throw new APIError("BAD_REQUEST", { message: "Use an authenticator app" });
        if (ctx.path === "/sign-in/email-otp") {
          const email = typeof ctx.body?.email === "string" ? ctx.body.email.toLowerCase() : "";
          const account = email && (await ctx.context.internalAdapter.findUserByEmail(email));
          if (!account || ("twoFactorEnabled" in account.user && account.user.twoFactorEnabled))
            throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid code" });
        }
        if (
          [
            "/link-social",
            "/unlink-account",
            "/passkey/verify-registration",
            "/passkey/delete-passkey",
          ].includes(ctx.path)
        ) {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          const user =
            session &&
            projectAuthUser(await ctx.context.internalAdapter.findUserById(session.user.id));
          if (!user?.emailVerified || user.banned || session?.session.impersonatedBy)
            throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
          if (ctx.path === "/unlink-account" || ctx.path === "/passkey/delete-passkey") {
            const accounts = await ctx.context.internalAdapter.findAccounts(user.id);
            const removed = accounts.find(
              (account) => ctx.path === "/unlink-account" && account.id === ctx.body?.accountId,
            );
            if (removed?.providerId === "credential")
              throw new APIError("BAD_REQUEST", {
                message: "Password credentials cannot be unlinked",
              });
            const fallback = accounts.some((account) => {
              if (account === removed) return false;
              if (account.providerId === "credential") return !!account.password;
              if (account.providerId === "google" || account.providerId === "github")
                return !!socialProviders[account.providerId];
              return false;
            });
            if (!fallback)
              throw new APIError("BAD_REQUEST", { message: "Add another sign-in method first" });
          }
        }
        if (ctx.path.startsWith("/admin/") && (ctx.request || ctx.headers)) {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          const user = session && (await ctx.context.internalAdapter.findUserById(session.user.id));
          const profile = projectAuthUser(user);
          if (
            !session ||
            !profile?.emailVerified ||
            profile.banned ||
            profile.id !== session.session.userId ||
            ("impersonatedBy" in session.session && session.session.impersonatedBy)
          )
            throw new APIError("FORBIDDEN", { code: "FORBIDDEN", message: "Access denied" });
          const roles = assignedRoles(profile.role);
          if (ctx.path === "/admin/has-permission") {
            const permissions = ctx.body?.permissions;
            if (
              !permissions ||
              typeof permissions !== "object" ||
              Array.isArray(permissions) ||
              !Object.values(permissions).every(
                (actions) =>
                  Array.isArray(actions) && actions.every((action) => typeof action === "string"),
              )
            )
              throw new APIError("BAD_REQUEST", { message: "Invalid permissions" });
            return ctx.json({
              error: null,
              success: roles.some((role) => accountRoles[role].authorize(permissions).success),
            });
          }
          const action =
            ctx.path === "/admin/set-role"
              ? "set-role"
              : ctx.path === "/admin/list-users"
                ? "list"
                : ctx.path === "/admin/get-user"
                  ? "get"
                  : null;
          // Admin's middleware reads the session cache again. Check the fresh user
          // before dispatch so a failed cache refresh cannot preserve old privileges.
          if (
            !action ||
            !roles.some((role) => accountRoles[role].authorize({ user: [action] }).success)
          )
            throw new APIError("FORBIDDEN", { code: "FORBIDDEN", message: "Access denied" });
          if (ctx.path === "/admin/set-role" && String(ctx.body?.userId) === profile.id)
            throw new APIError("FORBIDDEN", {
              code: "SELF_ROLE_CHANGE_FORBIDDEN",
              message: "Cannot change your own role",
            });
        }
        if (
          revokeHostAuthorizations &&
          ["/revoke-session", "/revoke-sessions", "/revoke-other-sessions"].includes(ctx.path)
        ) {
          const session = await getAuthoritativeSessionFromCtx(ctx);
          if (!session) throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
          let sessionId: string | undefined;
          if (ctx.path === "/revoke-session") {
            const token = ctx.body?.token;
            if (typeof token !== "string") return;
            const target = await ctx.context.internalAdapter.findSession(token);
            if (target?.session.userId !== session.user.id) return;
            sessionId = target.session.id;
          }
          // Capture identity before the endpoint deletes sessions, without revoking
          // anything until that endpoint has actually succeeded.
          return {
            context: { context: { hostRevocation: { userId: session.user.id, sessionId } } },
          };
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const revocation = (
          ctx.context as typeof ctx.context & {
            hostRevocation?: { userId: string; sessionId?: string };
          }
        ).hostRevocation;
        const result = ctx.context.returned;
        if (
          revokeHostAuthorizations &&
          revocation &&
          result &&
          typeof result === "object" &&
          "status" in result &&
          result.status === true
        )
          await revokeHostAuthorizations(revocation.userId, revocation.sessionId);
      }),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: authPolicy.passwordMinLength,
      maxPasswordLength: authPolicy.passwordMaxLength,
      revokeSessionsOnPasswordReset: true,
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        role: "member",
        banned: false,
        banReason: null,
        banExpires: null,
        ...additionalFields,
        id,
      }),
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
  return auth;
}
export type Auth = ReturnType<typeof createAuth>;
export function projectAuthUser(value: unknown): AuthUser | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    typeof v.email !== "string" ||
    typeof v.name !== "string" ||
    typeof v.emailVerified !== "boolean" ||
    typeof v.role !== "string" ||
    typeof v.banned !== "boolean"
  )
    return null;
  return {
    id: v.id,
    email: v.email,
    name: v.name,
    emailVerified: v.emailVerified,
    role: v.role,
    banned: v.banned,
    ...(typeof v.image === "string" || v.image === null ? { image: v.image } : {}),
  };
}
/** Resolve roles from the user record on every call, independent of cached session users. */
export async function readAuthSession(
  auth: Pick<Auth, "api" | "$context">,
  headers: Headers,
): Promise<AuthSession | null> {
  const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!result || ("impersonatedBy" in result.session && result.session.impersonatedBy)) return null;
  const user = projectAuthUser(
    await (await auth.$context).internalAdapter.findUserById(result.user.id),
  );
  if (!user || user.banned || user.id !== result.session.userId) return null;
  return {
    user,
    session: {
      id: result.session.id,
      userId: result.session.userId,
      expiresAt: result.session.expiresAt,
      createdAt: result.session.createdAt,
    },
  };
}
