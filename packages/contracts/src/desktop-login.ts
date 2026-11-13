import { z } from "zod";

export const desktopAuthorizationPath = "/desktop-authorize";
export const desktopCallbackPath = "/desktop-login/callback";
export const desktopOAuthClientId = "raypx-desktop";
export const oauthAuthorizePath = "/api/auth/oauth2/authorize";
export const oauthTokenPath = "/api/auth/oauth2/token";
export const desktopLoginPaths = {
  start: "/desktop-login/start",
  browser: "/desktop-login/browser",
  inspect: "/desktop-login/inspect",
  decide: "/desktop-login/decide",
  exchange: "/desktop-login/exchange",
} as const;

export const desktopLoginTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const desktopOAuthCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const accountId = z.string().min(1).max(200);
const redirectUri = z
  .string()
  .regex(/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/desktop-login\/callback$/)
  .url();
export const desktopLoginStartSchema = z.strictObject({
  redirectUri,
  state: desktopLoginTokenSchema,
  nonce: desktopLoginTokenSchema,
  challenge: desktopLoginTokenSchema,
  device: z.string().trim().min(1).max(120),
  webOrigin: z.string().url().max(2048),
  accountId: accountId.optional(),
  reauthorizeHost: z.literal(true).optional(),
});
export const desktopOAuthQuerySchema = z.string().min(1).max(3072);
export const desktopLoginRequestSchema = z.strictObject({ oauthQuery: desktopOAuthQuerySchema });
export const desktopLoginDecisionSchema = desktopLoginRequestSchema.extend({
  approve: z.boolean(),
  accountId,
});
export const desktopLoginPreviewSchema = z.strictObject({
  device: desktopLoginStartSchema.shape.device,
  accountId,
  email: z.email(),
  matchesProfile: z.boolean(),
  reauthenticationRequired: z.boolean().optional(),
});
export const desktopLoginRedirectSchema = z.strictObject({
  redirectUri: z
    .string()
    .url()
    .max(1024)
    .regex(/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/desktop-login\/callback\?/),
});
export const desktopLoginAuthorizationSchema = z.strictObject({
  authorizationUrl: z.string().url().max(3072),
});
export const desktopOAuthTokensSchema = z.object({
  access_token: desktopOAuthCodeSchema,
  id_token: z.string().min(1).max(4096),
  token_type: z.literal("Bearer"),
  scope: z.literal("openid"),
});
export const desktopLoginExchangeSchema = z.strictObject({
  accessToken: desktopOAuthTokensSchema.shape.access_token,
  idToken: desktopOAuthTokensSchema.shape.id_token,
  nonce: desktopLoginTokenSchema,
});
export const desktopLoginSessionSchema = z.strictObject({ accountId });
