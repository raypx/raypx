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

export const auth = createAuthClient({
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

export type AnyAuthClient = Omit<AuthClient, "getSession" | "signUp">;
