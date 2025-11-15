import {
  anonymousClient,
  apiKeyClient,
  emailOTPClient,
  genericOAuthClient,
  magicLinkClient,
  multiSessionClient,
  oneTapClient,
  organizationClient,
  passkeyClient,
  twoFactorClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { envs } from "../envs";

const env = envs();

export const auth = createAuthClient({
  baseURL: env.VITE_AUTH_URL,
  plugins: [
    apiKeyClient(),
    multiSessionClient(),
    passkeyClient(),
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
  ],
});

export type AuthClientType = typeof auth;

export type AuthClient = typeof auth;

export type AnyAuthClient = Omit<AuthClient, "getSession">;
