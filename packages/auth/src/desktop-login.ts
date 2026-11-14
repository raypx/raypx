import type { Session } from "better-auth";
import { APIError, createAuthEndpoint, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { verifyJWT } from "better-auth/plugins/jwt";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import {
  desktopAuthorizationPath,
  desktopCallbackPath,
  desktopLoginDecisionSchema,
  desktopLoginExchangeSchema,
  desktopLoginPaths,
  desktopLoginRequestSchema,
  desktopLoginStartSchema,
  desktopLoginTokenSchema,
  desktopOAuthClientId,
  desktopOAuthCodeSchema,
  desktopOAuthQuerySchema,
  oauthAuthorizePath,
} from "@raypx/contracts/api";
import { z } from "zod";

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
// Link the consent decision to the provider's own code and token records.
const approvalSchema = z.strictObject({
  accountId: z.string(),
  sessionId: z.string(),
  codeHash: z.string(),
});
const identitySchema = z.object({
  sub: z.string(),
  nonce: desktopLoginTokenSchema,
  auth_time: z.number().int(),
  exp: z.number().int(),
});
const accessSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  authorizationCodeId: z.string(),
  expiresAt: z.date(),
  revoked: z.null().optional(),
});

type AuthContext = Parameters<typeof getAuthoritativeSessionFromCtx>[0];
type Consent = (
  headers: Headers,
  body: { accept: boolean; oauth_query: string },
) => Promise<{ url: string }>;

export async function desktopOAuthHash(value: string, type: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  const hash = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  return `raypx-oauth:${type}:${hash}`;
}

function invalid() {
  return new APIError("BAD_REQUEST", {
    code: "INVALID_DESKTOP_LOGIN",
    message: "Desktop login is invalid or expired",
  });
}

function requireDaemon(headers: Headers | undefined) {
  if (!headers || headers.has("origin") || headers.has("cookie"))
    throw new APIError("FORBIDDEN", { message: "Desktop login requires a native request" });
}

async function browserSession(ctx: AuthContext) {
  const current = await getAuthoritativeSessionFromCtx(ctx);
  const user = current && (await ctx.context.internalAdapter.findUserById(current.session.userId));
  if (
    !current ||
    !user?.emailVerified ||
    ("banned" in user && user.banned === true) ||
    current.session.impersonatedBy
  )
    throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
  return { user, session: current.session };
}

async function ensureClient(ctx: AuthContext) {
  const adapter = ctx.context.adapter;
  const where = [{ field: "clientId", value: desktopOAuthClientId }];
  if (await adapter.findOne({ model: "oauthClient", where })) return;
  try {
    await adapter.create({
      model: "oauthClient",
      data: {
        clientId: desktopOAuthClientId,
        name: "Raypx Desktop",
        applicationType: "native",
        tokenEndpointAuthMethod: "none",
        redirectUris: [`http://127.0.0.1:1${desktopCallbackPath}`],
        requirePKCE: true,
        skipConsent: false,
        scopes: ["openid"],
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    if (!(await adapter.findOne({ model: "oauthClient", where }))) throw error;
  }
}

export function desktopLogin(issuer: string, origins: readonly string[], consent: Consent) {
  const pendingKey = (nonce: string) => `${issuer}:desktop-login:pending:${nonce}`;
  const approvedKey = (nonce: string) => `${issuer}:desktop-login:approved:${nonce}`;
  const requireWeb = (ctx: AuthContext, webOrigin: string) => {
    if (ctx.headers?.get("origin") !== webOrigin)
      throw new APIError("FORBIDDEN", { message: "Untrusted origin" });
  };
  const pendingSchema = desktopLoginStartSchema;
  async function pending(ctx: AuthContext, query: string) {
    if (
      !desktopOAuthQuerySchema.safeParse(query).success ||
      !(await verifyOAuthQueryParams(query, ctx.context.secret))
    )
      throw invalid();
    const params = new URLSearchParams(query);
    const nonce = desktopLoginTokenSchema.safeParse(params.get("nonce"));
    if (!nonce.success || params.get("client_id") !== desktopOAuthClientId) throw invalid();
    const value = await ctx.context.internalAdapter.findVerificationValue(pendingKey(nonce.data));
    if (!value || value.expiresAt.getTime() <= Date.now()) throw invalid();
    const attempt = pendingSchema.parse(JSON.parse(value.value));
    if (
      params.get("state") !== attempt.state ||
      params.get("redirect_uri") !== attempt.redirectUri ||
      params.get("code_challenge") !== attempt.challenge ||
      params.get("scope") !== "openid"
    )
      throw invalid();
    return attempt;
  }
  return {
    id: "raypx-desktop-login",
    endpoints: {
      desktopLoginStart: createAuthEndpoint(
        desktopLoginPaths.start,
        { method: "POST", body: desktopLoginStartSchema },
        async (ctx) => {
          requireDaemon(ctx.headers);
          const body = ctx.body;
          const web = new URL(body.webOrigin);
          if (
            web.origin !== body.webOrigin ||
            !/^https?:$/.test(web.protocol) ||
            !origins.includes(web.origin)
          )
            throw invalid();
          await ensureClient(ctx);
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: pendingKey(body.nonce),
            value: JSON.stringify(body),
            expiresAt: new Date(Date.now() + 5 * 60_000),
          });
          const authorization = new URL(oauthAuthorizePath, issuer);
          authorization.search = new URLSearchParams({
            client_id: desktopOAuthClientId,
            response_type: "code",
            scope: "openid",
            prompt: "consent",
            redirect_uri: body.redirectUri,
            state: body.state,
            nonce: body.nonce,
            code_challenge: body.challenge,
            code_challenge_method: "S256",
          }).toString();
          return ctx.json({ authorizationUrl: authorization.href }, { headers: noStore });
        },
      ),
      desktopLoginBrowser: createAuthEndpoint(
        desktopLoginPaths.browser,
        { method: "GET" },
        async (ctx) => {
          const query = new URL(ctx.request!.url).search.slice(1);
          const attempt = await pending(ctx, query);
          const url = new URL(desktopAuthorizationPath, attempt.webOrigin);
          url.searchParams.set("oauth", query);
          for (const [name, value] of Object.entries(noStore)) ctx.setHeader(name, value);
          throw ctx.redirect(url.href);
        },
      ),
      desktopLoginInspect: createAuthEndpoint(
        desktopLoginPaths.inspect,
        { method: "POST", body: desktopLoginRequestSchema },
        async (ctx) => {
          const attempt = await pending(ctx, ctx.body.oauthQuery);
          requireWeb(ctx, attempt.webOrigin);
          const { user } = await browserSession(ctx);
          return ctx.json(
            {
              device: attempt.device,
              accountId: user.id,
              email: user.email,
            },
            { headers: noStore },
          );
        },
      ),
      desktopLoginDecide: createAuthEndpoint(
        desktopLoginPaths.decide,
        { method: "POST", body: desktopLoginDecisionSchema },
        async (ctx) => {
          const attempt = await pending(ctx, ctx.body.oauthQuery);
          requireWeb(ctx, attempt.webOrigin);
          const { user, session } = await browserSession(ctx);
          if (user.id !== ctx.body.accountId)
            throw new APIError("FORBIDDEN", {
              message: "Account does not match the Desktop authorization",
            });
          if (
            !(await ctx.context.internalAdapter.consumeVerificationValue(pendingKey(attempt.nonce)))
          )
            throw invalid();
          const { url } = await consent(ctx.headers!, {
            accept: ctx.body.approve,
            oauth_query: ctx.body.oauthQuery,
          });
          const redirect = new URL(url);
          if (
            redirect.origin + redirect.pathname !== attempt.redirectUri ||
            redirect.searchParams.get("state") !== attempt.state ||
            redirect.searchParams.get("iss") !== issuer
          )
            throw invalid();
          if (ctx.body.approve) {
            const code = desktopOAuthCodeSchema.parse(redirect.searchParams.get("code"));
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: approvedKey(attempt.nonce),
              expiresAt: new Date(Date.now() + 60_000),
              value: JSON.stringify({
                accountId: user.id,
                sessionId: session.id,
                codeHash: await desktopOAuthHash(code, "authorization_code"),
              }),
            });
          }
          return ctx.json({ redirectUri: redirect.href }, { headers: noStore });
        },
      ),
      desktopLoginExchange: createAuthEndpoint(
        desktopLoginPaths.exchange,
        { method: "POST", body: desktopLoginExchangeSchema },
        async (ctx) => {
          requireDaemon(ctx.headers);
          const { idToken, nonce, accessToken } = ctx.body;
          const identity = identitySchema.safeParse(
            await verifyJWT(idToken, { jwt: { issuer, audience: desktopOAuthClientId } }),
          );
          if (!identity.success || identity.data.nonce !== nonce) throw invalid();
          const key = approvedKey(nonce);
          const approval = await ctx.context.internalAdapter.findVerificationValue(key);
          if (!approval || approval.expiresAt.getTime() <= Date.now()) throw invalid();
          const grant = approvalSchema.parse(JSON.parse(approval.value));
          const tokenWhere = [
            { field: "token", value: await desktopOAuthHash(accessToken, "access_token") },
            { field: "clientId", value: desktopOAuthClientId },
          ];
          const [access, source, user] = await Promise.all([
            ctx.context.adapter
              .findOne({ model: "oauthAccessToken", where: tokenWhere })
              .then((value) => accessSchema.safeParse(value)),
            ctx.context.adapter.findOne<Session & { impersonatedBy?: string | null }>({
              model: "session",
              where: [{ field: "id", value: grant.sessionId }],
            }),
            ctx.context.internalAdapter.findUserById(grant.accountId),
          ]);
          if (
            !access.success ||
            access.data.expiresAt.getTime() <= Date.now() ||
            access.data.revoked ||
            access.data.authorizationCodeId !== grant.codeHash ||
            access.data.userId !== grant.accountId ||
            access.data.sessionId !== grant.sessionId ||
            identity.data.sub !== grant.accountId ||
            !source ||
            source.userId !== grant.accountId ||
            source.impersonatedBy ||
            source.expiresAt.getTime() <= Date.now() ||
            Math.floor(source.createdAt.getTime() / 1000) !== identity.data.auth_time ||
            !user?.emailVerified ||
            ("banned" in user && user.banned === true)
          )
            throw invalid();
          if (
            !(await ctx.context.internalAdapter.consumeVerificationValue(key)) ||
            !(await ctx.context.adapter.consumeOne({
              model: "oauthAccessToken",
              where: tokenWhere,
            }))
          )
            throw invalid();
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            false,
            {
              createdAt: source.createdAt,
              userAgent: "Raypx Desktop",
            },
            true,
          );
          if (!session)
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Desktop session unavailable" });
          await setSessionCookie(ctx, { session, user }, false);
          return ctx.json({ accountId: user.id }, { headers: noStore });
        },
      ),
    },
  };
}
