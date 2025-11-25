import {
  adminClient,
  anonymousClient,
  apiKeyClient,
  emailOTPClient,
  genericOAuthClient,
  lastLoginMethodClient,
  magicLinkClient,
  multiSessionClient,
  oneTapClient,
  organizationClient,
  twoFactorClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { envs } from "../envs";

const env = envs();

export const auth = createAuthClient({
  baseURL: env.VITE_AUTH_URL,
  plugins: [
    adminClient(),
    apiKeyClient(),
    multiSessionClient(),
    oneTapClient({
      clientId: "",
    }),
    genericOAuthClient(),
    anonymousClient(),
    usernameClient(),
    magicLinkClient(),
    emailOTPClient(),
    twoFactorClient(),
    organizationClient(),
    lastLoginMethodClient(),
  ],
});

export type AuthClientType = typeof auth;

export type AuthClient = typeof auth;

export type AnyAuthClient = Omit<AuthClient, "getSession">;

export type AuthUser = Awaited<ReturnType<typeof auth.getSession>>["session"]["user"];
